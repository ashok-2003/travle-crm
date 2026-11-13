// What a person decided on the lead reaches the lite turn: a customer marked Not a lead gets no new lead and no answer,
// while a Lost one's next trip still gets its lead; a value confirmed with "Looks right" is the person's, and one
// dismissed with "Not right" is asked again.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideSuggestions } from "../../../src/ai/fill/lead-fields.js";
import { valueHash } from "../../../src/ai/fill/values.js";
import { handOverSentences } from "../../../src/ai/lite/act-words.js";
import { fixedText } from "../../../src/ai/lite/fixed-texts.js";
import { readLiteFacts } from "../../../src/ai/lite/merge.js";
import type { LiteTrace } from "../../../src/ai/lite/types.js";
import { formatRupees } from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import { at, greeting, outbound, says, understood, withFacts, written, type Agency } from "./support/turn-script.js";

const DAY_MS = 86_400_000;
const kedarnath = { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false };
const fourteenth = { day: "2026-11-14", month: null, proof: "14 nov", changed: false };
const twoPeople = { count: 2, proof: "2 people", changed: false };

/** Moves every lead the chat's person has to `stage`. */
const markLeads = (on: Agency, stage: "lost" | "not_a_lead") =>
  on.inOrg((tx) => tx.lead.updateMany({ where: { personId: on.chat.personId ?? "" }, data: { stage } }));
const leadCount = (on: Agency) => on.inOrg((tx) => tx.lead.count({ where: { personId: on.chat.personId ?? "" } }));

/** Three adults on the lead, as the AI filled them from the chat it settled: a suggested row hashing to 3. */
async function aiFilledThree(on: Agency): Promise<void> {
  await withFacts(on, {
    leadId: on.leadId,
    packageId: on.packageId,
    day: "2026-11-14",
    month: "2026-11",
    departureId: on.departures[0]?.id ?? null,
    adults: 3,
    roomType: "double",
    lastMove: "give_price",
  });
  await on.inOrg(async (tx) => {
    await tx.lead.update({ where: { id: on.leadId }, data: { adults: 3 } });
    await tx.leadAiField.create({
      data: { leadId: on.leadId, field: "adults", state: "suggested", valueHash: valueHash("trip.adults", 3) },
    });
  });
}

describe("what a person decided reaches the lite turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("a Not a lead customer's next hello opens no lead and sends nothing", async () => {
    const on = await liteAgency(test);
    await markLeads(on, "not_a_lead");
    const leads = await leadCount(on);
    const token = await says(on, "hi", 30);
    on.model.answer(understood([["hello", "hi"]]), written(greeting));
    expect(await on.turn(at(60), { token })).toBe("not_a_lead");
    expect(await outbound(on)).toHaveLength(0);
    expect(await leadCount(on)).toBe(leads);
    // Nobody is told: the chat is not handed over or flagged, and nothing was written for a reply.
    const chat = await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }));
    expect(chat?.handedOffAt ?? null).toBeNull();
    expect(chat?.attentionReason ?? null).toBeNull();
    expect(on.model.requests.map((request) => request.schema?.name)).toEqual(["understand_form"]);
  });

  it("a Lost customer's next price question still opens one", async () => {
    const on = await liteAgency(test);
    // An older lead marked Not a lead: only the newest decides.
    await on.inOrg((tx) =>
      aLead(tx, {
        personId: on.chat.personId ?? "",
        stage: "not_a_lead",
        createdAt: new Date(testNow.getTime() - 30 * DAY_MS),
      }),
    );
    await on.inOrg((tx) =>
      tx.lead.updateMany({
        where: { personId: on.chat.personId ?? "", stage: { not: "not_a_lead" } },
        data: { stage: "lost" },
      }),
    );
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const leads = await leadCount(on);
    const token = await says(on, "price for kedarnath on 14 nov, 2 people, double?", 30);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: {
          package: kedarnath,
          date: fourteenth,
          adults: twoPeople,
          room: { type: "double", proof: "double", changed: false },
        },
      }),
      written("Which city will you join us from?"),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    expect((await outbound(on))[0]?.body).toContain(formatRupees(1_399_800));
    expect(await leadCount(on)).toBe(leads + 1);
  });

  it("a value confirmed with Looks right is locked: a customer who contradicts it goes to a person", async () => {
    const on = await liteAgency(test);
    await aiFilledThree(on);
    await on.inOrg((tx) => decideSuggestions(tx, on.owner, on.leadId, "confirm"));
    const token = await says(on, "my brother is coming too, 4 of us", 30);
    on.model.answer(
      understood([["price_question", "4 of us"]], {
        details: { adults: { count: 4, proof: "4 of us", changed: true } },
      }),
      written("Which city will you join us from?"),
    );
    expect(await on.turn(at(60), { token })).toBe("handed_off");
    expect((await outbound(on)).map((one) => one.body)).toEqual([fixedText("hand_over", "english", {}).text]);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(chat.handoffReason).toBe(handOverSentences.details_changed);
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead.adults).toBe(3);
  });

  it("Not right on adults: the next turn asks how many are travelling", async () => {
    const on = await liteAgency(test);
    await aiFilledThree(on);
    await on.inOrg((tx) => decideSuggestions(tx, on.owner, on.leadId, "dismiss", ["adults"]));
    // The chat's facts let the dismissed count go, and what the price rests on with it; the rest stays.
    expect(await on.inOrg((tx) => readLiteFacts(tx, on.chat.id))).toMatchObject({
      adults: null,
      quoted: null,
      packageId: on.packageId,
      day: "2026-11-14",
      roomType: "double",
    });
    const token = await says(on, "what is the price?", 30);
    on.model.answer(understood([["price_question", "what is the price"]]), written("How many of you are travelling?"));
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    expect(await on.turn(at(60), { token, traces: sink })).toBe("replied");
    expect(traces[0]?.asked).toBe("people");
  });
});
