// What a person decided on the lead reaches the lite turn: a customer marked Not a lead gets no new lead and no answer,
// while a Lost one's next trip still gets its lead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
