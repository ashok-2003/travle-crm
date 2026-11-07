// The grounded turn end to end against the real database and a scripted model: it reads, looks up, writes, checks and acts;
// every model call counts against the month's limit; a reply the check refuses is asked for once more, then the team is told.
import { randomUUID } from "node:crypto";
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT, runAgentTurn, saveAiSettings, saveAutopilot } from "../../../src/ai/index.js";
import { saveFacts } from "../../../src/ai/grounded/facts.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { formatRupees, parseCalendarDate, systemActor } from "../../../src/kernel/index.js";
import { saveOrganizationProfile } from "../../../src/profile/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { aLead } from "../../crm/support/records.js";
import { memberOf } from "../../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../../inbox/support.js";

const entitlements: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};
const turnAt = new Date(testNow.getTime() + 60_000);
const day = (text: string) => new Date(`${text}T00:00:00Z`);
const noActions = {
  sendFiles: [],
  sendAgencyFiles: false,
  sendPayment: false,
  requestBooking: false,
  flag: null,
  handOver: null,
  note: null,
  task: null,
};
const read = (changes: object = {}) =>
  JSON.stringify({
    places: [{ destination: "D1", words: "Spiti", evidence: "Spiti" }],
    startsOn: { date: "2026-11-14", month: null, evidence: "14 Nov" },
    rooms: [],
    travellers: { count: 2, evidence: "2 people" },
    budgetRupees: null,
    pickupCity: null,
    chosen: null,
    wants: "price",
    wantsEvidence: "price",
    special: null,
    nearest: [],
    ...changes,
  });
const write = (reply: string, actions: object = {}) => JSON.stringify({ reply, actions: { ...noActions, ...actions } });
const priced = "Spiti on [departure P1] is [price P1 double] per person.";

/** The agency's business details with its GST state, which a booking's group quote needs. */
const withGstState = (tx: OrgTx, organizationId: string) =>
  saveOrganizationProfile(
    tx,
    systemActor(organizationId),
    saveOrganizationProfileInput.parse({
      legalName: "Sharma Holidays Private Limited",
      gstin: "27AAPFU0939F1ZV",
      gstStateCode: "27",
      address: "Linking Road, Bandra West, Mumbai 400050",
      contactName: "Owner",
      contactPhone: "+919000000000",
      bankAccountName: "Sharma Holidays Private Limited",
      bankAccountNumber: "000123456789",
      bankIfsc: "HDFC0000001",
      bankName: "HDFC Bank",
      invoicePrefix: "SH",
      brandColour: null,
      documentTerms: null,
    }),
  );

describe("the grounded turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency with the Spiti group package (one open departure on 14 Nov) and a customer who has just written. */
  async function agency({
    grounded = true,
    text = "Spiti on 14 Nov for 2 people, price?",
    managers,
  }: { grounded?: boolean; text?: string; managers?: (organizationId: string) => Promise<string[]> } = {}) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), customerName: "Rahul", text }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    await inOrg(async (tx) => {
      await aLead(tx, {
        ...(chat.personId === null ? {} : { personId: chat.personId }),
        stage: "contacted",
        ownerUserId: owner.userId,
      });
      await saveAiSettings(
        tx,
        owner,
        { enabled: true, scoring: true, instructions: "" },
        { providerReady: true, now: testNow },
      );
      await saveAutopilot(
        tx,
        owner,
        {
          autopilot: true,
          grounded: false,
          agentName: "Riya",
          followUpHours: 4,
          maxRepliesPerDay: 25,
          language: "customer",
          languageOther: "",
          style: "human",
          emojis: "few",
          tone: "friendly",
          handoff: "alert",
          smartFollowUp: true,
          learning: false,
          persona: "sales",
          leadNotes: true,
          sendMedia: true,
          paymentDetails: "",
          strictRules: "",
          followUpTasks: true,
        },
        parseCalendarDate("2026-11-10"),
      );
      await tx.aiAutopilot.updateMany({ data: { grounded } });
      const destination = await tx.destination.create({ data: { name: "Spiti" }, select: { id: true } });
      const template = await tx.quoteTemplate.create({
        data: {
          name: "Spiti",
          title: "Spiti",
          kind: "group",
          destinationId: destination.id,
          roomTypes: ["double", "triple"],
          advancePerPersonPaise: 500_000n,
          aiSellable: true,
          nights: 6,
          paymentDetails: "Pay to UPI spiti@bank",
        },
        select: { id: true },
      });
      await tx.packageSeason.create({
        data: {
          templateId: template.id,
          label: "Nov",
          startsOn: day("2026-11-01"),
          endsOn: day("2026-11-30"),
          priceDoublePaise: 699_900n,
          priceTriplePaise: 599_900n,
        },
      });
      await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day("2026-11-14"),
          endDate: day("2026-11-20"),
          seatsTotal: 12,
          templateId: template.id,
        },
      });
    });
    const model = createMemoryAiModel();
    const logger = createMemoryLogger();
    const turn = (kind: "reply" | "nudge" | "followUp" = "reply", at = turnAt, followUp?: string) =>
      runAgentTurn(
        {
          db: test.db,
          ai: model,
          logger,
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
          agencyName: () => Promise.resolve("Sharma Holidays"),
          files: test.files,
          managers: managers ?? (() => Promise.resolve([])),
        },
        {
          organizationId,
          conversationId: chat.id,
          kind,
          token: kind === "reply" ? message.id : `${kind}:${chat.id}`,
          ...(followUp === undefined ? {} : { followUp }),
        },
        at,
      );
    const sent = () => inOrg((tx) => tx.whatsappMessage.findMany({ where: { direction: "out" } }));
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { organizationId, inOrg, chat, message, model, logger, turn, sent, calls };
  }

  it("a switched agency's turn reads, writes and sends the code's price", async () => {
    const on = await agency();
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("replied");
    const [only, ...rest] = await on.sent();
    expect(rest).toHaveLength(0);
    expect(only?.clientToken).toBe(`ai:${on.message.id}`);
    expect(only?.body).toContain(formatRupees(699_900));
    expect(on.model.requests).toHaveLength(2);
    expect(JSON.stringify(on.model.requests[0]?.messages)).toContain("READ_CHAT.");
    expect(JSON.stringify(on.model.requests[1]?.messages)).toContain("WRITE_REPLY.");
    expect(await on.calls()).toBe(2);
    const facts = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ select: { facts: true } }));
    expect(JSON.stringify(facts.facts)).toContain("2026-11-14");
    expect(on.logger.entries.some((entry) => entry.event === "ai.turn")).toBe(true);
    // The same turn again changes nothing.
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("answered");
    expect(await on.sent()).toHaveLength(1);
  });

  it("a typed price is asked again, then sent through a placeholder", async () => {
    const on = await agency();
    on.model.answer(read(), write("Spiti is ₹5,000 per person."), write(priced));
    expect(await on.turn()).toBe("replied");
    const body = (await on.sent())[0]?.body ?? "";
    expect(body).toContain(formatRupees(699_900));
    expect(body).not.toContain("5,000");
    expect(JSON.stringify(on.model.requests[2]?.messages)).toContain("amount");
    expect(await on.calls()).toBe(3);
  });

  it("blocked twice: nothing sent, the chat flagged with the reason", async () => {
    const on = await agency();
    on.model.answer(read(), write("Spiti is ₹5,000 per person."), write("Only ₹5,500 per person."));
    expect(await on.turn()).toBe("blocked");
    expect(await on.sent()).toHaveLength(0);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state.attentionReason).toContain("amount");
    expect(state.attentionAt).not.toBeNull();
    expect(await on.calls()).toBe(3);
    const logged = JSON.stringify(on.logger.entries);
    expect(logged).toContain("blocked");
    expect(logged).not.toContain("5,000");
    expect(logged).not.toContain("Spiti");
  });

  it("an unfit read ends the turn: the team is told, nothing is sent, the call is given back", async () => {
    const on = await agency();
    on.model.answer("not json at all");
    expect(await on.turn()).toBe("unfit");
    expect(await on.sent()).toHaveLength(0);
    expect((await on.inOrg((tx) => tx.aiChat.findFirstOrThrow())).attentionReason).toContain("unfit");
    expect(await on.calls()).toBe(0);
  });

  it("each model call counts against the monthly limit", async () => {
    const on = await agency();
    await on.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(turnAt, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT - 1 } }),
    );
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("limit");
    expect(on.model.requests).toHaveLength(1);
    expect(await on.sent()).toHaveLength(0);
    expect(await on.calls()).toBe(MONTHLY_AI_LIMIT);
  });

  it("every check before writing still stops the turn", async () => {
    const late = await agency();
    expect(await late.turn("reply", new Date(testNow.getTime() + 25 * 3_600_000))).toBe("window_closed");
    const stopped = await agency();
    await stopped.inOrg(async (tx) => {
      await tx.personConsent.create({
        data: {
          personId: stopped.chat.personId ?? "",
          purpose: "whatsapp",
          action: "withdrawn",
          wording: "STOP",
          wordingVersion: 1,
          source: "customer",
          recordedAt: testNow,
        },
      });
    });
    expect(await stopped.turn()).toBe("opted_out");
    const busy = await agency();
    await busy.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: busy.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "I will call you",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 30_000),
          wamid: randomUUID(),
        },
      }),
    );
    expect(["answered", "person_answering"]).toContain(await busy.turn());
    const capped = await agency();
    await capped.inOrg(async (tx) => {
      const today = new Date(`${turnAt.toISOString().slice(0, 10)}T00:00:00Z`);
      await tx.aiChat.create({ data: { conversationId: capped.chat.id, repliesOn: today, repliesCount: 25 } });
    });
    expect(await capped.turn()).toBe("day_limit");
    for (const one of [late, stopped, busy, capped]) expect(one.model.requests).toHaveLength(0);
  });

  it("an agency not switched runs the old agent", async () => {
    const off = await agency({ grounded: false });
    off.model.answer(
      JSON.stringify({
        reply: "Spiti is lovely. How many are travelling?",
        handoff: false,
        handoffReason: "",
        attention: "",
        memory: "",
        followUp: { needed: false, inHours: 1, why: "" },
      }),
    );
    expect(await off.turn()).toBe("replied");
    expect(off.model.requests).toHaveLength(1);
    expect(JSON.stringify(off.model.requests[0]?.messages)).not.toContain("READ_CHAT.");
    expect((await off.sent())[0]?.body).toContain("lovely");
  });

  it("Spiti and Manali in one message: one reply covers both, one flag", async () => {
    const on = await agency({ text: "Spiti or Manali on 14 Nov for 2 people?" });
    await on.inOrg((tx) => tx.aiSettings.updateMany({ data: { customTrips: true } }));
    on.model.answer(
      read({
        places: [
          { destination: "D1", words: "Spiti", evidence: "Spiti" },
          { destination: "none", words: "Manali", evidence: "Manali" },
        ],
        wants: "information",
        wantsEvidence: "Spiti or Manali",
      }),
      write("We run Spiti from [from P1 double] per person. We don't run Manali, but a custom trip is possible."),
    );
    expect(await on.turn()).toBe("replied_flagged");
    const sent = await on.sent();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain("Spiti");
    expect(sent[0]?.body).toContain("Manali");
    expect(await on.inOrg((tx) => tx.notification.count({ where: { kind: "ai.handoff" } }))).toBe(1);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state.attentionReason).toContain("not_run");
    expect(await on.calls()).toBe(2);
  });

  it("a place not run named in another script hands the chat to the team: nothing sent, never a 'we don't run' (M6)", async () => {
    const on = await agency({ text: "मनाली का पैकेज बताइए" });
    on.model.answer(
      read({
        places: [{ destination: "none", words: "मनाली", evidence: "मनाली" }],
        startsOn: null,
        travellers: null,
        wants: "information",
        wantsEvidence: "पैकेज बताइए",
      }),
      write("We don't run मनाली, sorry."),
    );
    expect(await on.turn()).toBe("handed_off");
    expect(await on.sent()).toHaveLength(0);
    expect(on.model.requests).toHaveLength(1);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state.handedOffAt).not.toBeNull();
    expect(state.attentionReason).toContain("not_run_script");
    expect(JSON.stringify(state.facts)).toContain("मनाली");
    expect(await on.inOrg((tx) => tx.notification.count({ where: { kind: "ai.handoff" } }))).toBe(1);
    expect(on.logger.entries.some((entry) => entry.reason === "not_run_script")).toBe(true);
  });

  /** Stores what a chat has settled about Spiti on 14 Nov, as the read of an earlier turn would have. */
  async function settled(on: Awaited<ReturnType<typeof agency>>) {
    const destination = await on.inOrg((tx) => tx.destination.findFirstOrThrow());
    await on.inOrg((tx) =>
      saveFacts(tx, on.chat.id, {
        places: [{ destinationId: destination.id, words: "Spiti" }],
        notRun: [],
        startsOn: "2026-11-14",
        month: null,
        rooms: [],
        travellers: 2,
        budgetPaise: null,
        pickupCity: null,
        packageId: null,
        departureId: null,
        sentFileIds: [],
        paymentSentFor: null,
        bookingId: null,
      }),
    );
  }

  it("a nudge writes from the facts without reading", async () => {
    const on = await agency();
    await settled(on);
    on.model.answer(
      write("Still thinking about Spiti on [departure P1]? [seats P1] seats are left.", { sendPayment: true }),
    );
    expect(await on.turn("nudge")).toBe("replied");
    expect(on.model.requests).toHaveLength(1);
    expect(JSON.stringify(on.model.requests[0]?.messages)).toContain("went quiet");
    expect(JSON.stringify(on.model.requests[0]?.messages)).not.toContain("READ_CHAT.");
    expect(await on.sent()).toHaveLength(1);
    expect(await on.calls()).toBe(1);
  });

  it("a reply plans the follow-up the model chose; the nudge that comes of it is stamped and plans none", async () => {
    const on = await agency();
    on.model.answer(
      read(),
      JSON.stringify({ ...JSON.parse(write(priced)), followUp: { inHours: 2, why: "hot lead" } }),
    );
    expect(await on.turn()).toBe("replied");
    const planned = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(planned.followUpAt?.getTime()).toBe(turnAt.getTime() + 2 * 3_600_000);
    expect(planned).toMatchObject({ followUpReason: "hot lead", lastNudgeAt: null });
    const nudgeAt = new Date(turnAt.getTime() + 2 * 3_600_000);
    on.model.answer(write("Still thinking about Spiti on [departure P1]?"));
    expect(await on.turn("nudge", nudgeAt)).toBe("replied");
    const nudged = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(nudged.lastNudgeAt?.getTime()).toBe(nudgeAt.getTime());
    expect(nudged.followUpAt).toBeNull();
  });

  it("with the smart follow-up off, a reply plans the agency's fixed hours", async () => {
    const on = await agency();
    await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { smartFollowUp: false } }));
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("replied");
    const planned = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(planned.followUpAt?.getTime()).toBe(turnAt.getTime() + 4 * 3_600_000);
  });

  it("hands over only as the policy allows, and a hand-over leaves the chat waiting for a person", async () => {
    const never = await agency();
    never.model.answer(read(), write("Let me check.", { handOver: "asks for a manager" }));
    expect(await never.turn()).toBe("replied_flagged");
    const kept = await never.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(kept.handedOffAt).toBeNull();
    expect(kept.attentionReason).toContain("asks for a manager");
    const asked = await agency();
    await asked.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { handoff: "asked" } }));
    asked.model.answer(read(), write("A colleague will get back to you shortly.", { handOver: "asks for a manager" }));
    expect(await asked.turn()).toBe("handed_off");
    const chat = await asked.inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    expect(chat.needsReply).toBe(true);
    expect((await asked.inOrg((tx) => tx.aiChat.findFirstOrThrow())).followUpAt).toBeNull();
  });

  it("an answer that does not fit twice is blocked as unfit, each call given back or counted as it was used", async () => {
    const on = await agency();
    on.model.answer(read(), "no json", "still no json");
    expect(await on.turn()).toBe("blocked");
    expect(await on.sent()).toHaveLength(0);
    expect((await on.inOrg((tx) => tx.aiChat.findFirstOrThrow())).attentionReason).toContain("unfit");
    // The read was used; the two unfit writes were given back.
    expect(await on.calls()).toBe(1);
  });

  it("a stored facts row that cannot be read is logged once, with no content", async () => {
    const on = await agency();
    await on.inOrg((tx) =>
      tx.aiChat.create({ data: { conversationId: on.chat.id, facts: { places: "garbage", secret: "Rahul" } } }),
    );
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("replied");
    const resets = on.logger.entries.filter((entry) => entry.event === "ai.facts-reset");
    expect(resets).toHaveLength(1);
    expect(JSON.stringify(resets)).not.toContain("Rahul");
  });

  it("a reply that repeats a recent message sends nothing and leaves the team the old note", async () => {
    const on = await agency();
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "automation",
          kind: "text",
          body: "Spiti on Sat 14 Nov is ₹6,999 per person right now for you",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 30_000),
          wamid: randomUUID(),
        },
      }),
    );
    await settled(on);
    const again = write("Spiti on [departure P1] is [price P1 double] per person right now for you");
    on.model.answer(again, again);
    expect(await on.turn("nudge")).toBe("replied_flagged");
    expect(await on.sent()).toHaveLength(1);
    expect(on.model.requests).toHaveLength(2);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state.attentionReason).toBe(
      "The AI's reply repeated an earlier message, so it wasn't sent: please answer this customer.",
    );
    expect(await on.inOrg((tx) => tx.notification.count({ where: { kind: "ai.handoff" } }))).toBe(1);
  });

  it("a booking is taken when the lookup of who to tell opens a transaction of its own, as the worker's does", async () => {
    // The worker's lookup of managers is its own forOrg: asked inside the turn's transaction it would throw NestedForOrgError.
    let asked = 0;
    const on = await agency({
      text: "Book Spiti on 14 Nov for 2 people, double sharing",
      managers: (organizationId) => {
        asked += 1;
        return test.db.forOrg(organizationId, () => Promise.resolve([]));
      },
    });
    // The group quote needs the agency's GST state: without one the AI takes no booking.
    await on.inOrg((tx) => withGstState(tx, on.organizationId));
    on.model.answer(
      read({
        rooms: [{ type: "double", count: 1, evidence: "double sharing" }],
        wants: "book",
        wantsEvidence: "Book",
        travellers: { count: 2, evidence: "2 people" },
      }),
      write("Holding 2 seats on [departure P1]. The total is [total P1], the advance [advance total P1].", {
        sendPayment: true,
        requestBooking: true,
      }),
    );
    expect(await on.turn()).toBe("replied");
    expect(asked).toBe(1);
    expect(await on.inOrg((tx) => tx.aiBooking.count())).toBe(1);
  });

  it("an agency with no GST state takes no booking: the reply says the team will confirm, and no money moves", async () => {
    const on = await agency({ text: "Book Spiti on 14 Nov for 2 people, double sharing" });
    on.model.answer(
      read({
        rooms: [{ type: "double", count: 1, evidence: "double sharing" }],
        wants: "book",
        wantsEvidence: "Book",
      }),
      write("The team will confirm your booking and send the payment details.", {
        sendPayment: true,
        requestBooking: true,
      }),
    );
    expect(await on.turn()).toBe("replied");
    expect(JSON.stringify(on.model.requests[1]?.messages)).toContain("the team confirms bookings and payment");
    expect(await on.inOrg((tx) => tx.aiBooking.count())).toBe(0);
    expect(await on.sent()).toHaveLength(1);
  });

  it("a refusal while acting ends as blocked: nothing sent, flagged once with its reason, the call stays counted", async () => {
    const on = await agency();
    // The number is paused between the lookup and the send: the send is refused and the turn rolls back.
    const complete = on.model.complete.bind(on.model);
    let writes = 0;
    on.model.complete = async (request) => {
      const result = await complete(request);
      writes += 1;
      if (writes === 2) await on.inOrg((tx) => tx.whatsappConnection.updateMany({ data: { status: "paused" } }));
      return result;
    };
    on.model.answer(read(), write(priced));
    expect(await on.turn()).toBe("blocked");
    expect(await on.sent()).toHaveLength(0);
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state.attentionReason).toContain("WHATSAPP_PAUSED");
    expect(await on.inOrg((tx) => tx.notification.count({ where: { kind: "ai.handoff" } }))).toBe(1);
    expect(await on.calls()).toBe(2);
  });

  it("a place not run read in a turn that could not write is still news to the team next turn (R1)", async () => {
    const on = await agency({ text: "Spiti on 14 Nov for 2 people, and Meghalaya too, price?" });
    const withMeghalaya = read({
      places: [
        { destination: "D1", words: "Spiti", evidence: "Spiti" },
        { destination: "none", words: "Meghalaya", evidence: "Meghalaya" },
      ],
    });
    on.model.answer(withMeghalaya, { ok: false, reason: "unavailable" });
    expect(await on.turn()).toBe("unavailable");
    const kept = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(JSON.stringify(kept.facts)).toContain("2026-11-14");
    expect(kept.attentionReason).toBeNull();
    on.model.answer(withMeghalaya, write(`${priced} We don't run Meghalaya.`));
    expect(await on.turn()).toBe("replied_flagged");
    expect((await on.inOrg((tx) => tx.aiChat.findFirstOrThrow())).attentionReason).toContain("not_run");
  });

  it("a first write that fails or hits the limit still keeps what the read settled, and flags nothing", async () => {
    const down = await agency();
    down.model.answer(read(), { ok: false, reason: "unavailable" });
    expect(await down.turn()).toBe("unavailable");
    const full = await agency();
    await full.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(turnAt, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT - 1 } }),
    );
    full.model.answer(read(), write(priced));
    expect(await full.turn()).toBe("limit");
    for (const one of [down, full]) {
      const state = await one.inOrg((tx) => tx.aiChat.findFirstOrThrow());
      expect(JSON.stringify(state.facts)).toContain("2026-11-14");
      expect(state.attentionReason).toBeNull();
      expect(await one.sent()).toHaveLength(0);
    }
  });
});
