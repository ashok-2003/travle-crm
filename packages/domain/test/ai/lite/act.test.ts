// The lite agent's act step against the real database: in the turn's one transaction it holds, books and sends the money
// message from the agency's own payment details, sends a picked package's files once, hands over with a fixed line, and
// sends nothing at all when the turn went stale, the agent was paused, or the booking can no longer be taken.
import { randomUUID } from "node:crypto";
import { liteFacts, type LiteFacts, type UnderstandForm } from "@travel-crm/contracts/ai";
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { actOnMove, type LiteActInput, type LiteActResult } from "../../../src/ai/lite/act.js";
import { fixedText } from "../../../src/ai/lite/fixed-texts.js";
import { situationOf } from "../../../src/ai/lite/lookups/situation.js";
import { readLiteFacts } from "../../../src/ai/lite/merge.js";
import type { CheckedForm, Decision, Move, PackageIndexEntry, Situation } from "../../../src/ai/lite/types.js";
import { DomainError, formatRupees } from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteToday, liteTurnAt } from "./support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;

const decision = (move: Move, facts: LiteFacts, changes: Partial<Decision> = {}): Decision => ({
  move,
  stage: "quoted",
  why: "test",
  facts,
  stopFollowUps: false,
  note: null,
  task: null,
  stageTo: null,
  suggest: null,
  ...changes,
});
const checkedForm = (summary: string): CheckedForm => {
  const form: UnderstandForm = {
    intents: [{ name: "package_question", proof: "" }],
    details: {
      package: null,
      place: null,
      date: null,
      adults: null,
      children: null,
      name: null,
      pickup_city: null,
      room: null,
      pay_in_full: null,
    },
    open_to_other_trips: "unknown",
    lookups: [],
    language: "english",
    summary,
    score: {
      chance: 72,
      label: "hot",
      reasons: ["Asked about a trip"],
      looks_fake: false,
      fake_why: "",
      standing: "Keen on Kedarnath",
      next_step: "Share the dates",
    },
  };
  return { form, proofs: { adults: { excerpt: "we are 2", messageIds: [] } }, dropped: [] };
};
const failure = (error: unknown) => (error instanceof DomainError ? error.reason : String(error));
const done = (result: LiteActResult) => {
  if (result === "already" || "stopped" in result) throw new Error("expected the turn to act");
  return result;
};

describe("the lite agent's act step", () => {
  let test: TestInbox;
  let platform: PlatformClient;
  beforeAll(() => {
    test = createTestInbox();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  const deps = () => ({
    files: test.files,
    recipients: () => Promise.resolve([]),
    storageLimitBytes: null,
    supplierStateCode: "27",
  });

  /**
   * The facts of a party of two in double sharing on the 14 Nov departure, as the price told them: ₹6,999 each, ₹13,998
   * in all, ₹2,000 each to book. (Two in a triple fill no room, so this package has no total for them.)
   */
  const pricedFacts = (on: Agency, changes: Partial<LiteFacts> = {}): LiteFacts => ({
    ...liteFacts.parse({ agent: "lite" }),
    packageId: on.packageId,
    day: "2026-11-14",
    month: "2026-11",
    departureId: on.departures[0]?.id ?? null,
    adults: 2,
    roomType: "double",
    name: "Riya Sharma",
    quoted: { departureId: on.departures[0]?.id ?? "", totalPaise: 1_399_800, advancePaise: 400_000 },
    lastMove: "book",
    ...changes,
  });
  const book = (on: Agency): Move => ({
    kind: "book",
    packageId: on.packageId,
    departureId: on.departures[0]?.id ?? "",
  });

  /** Acts in one transaction, as the turn does, the situation read for the decision's facts. */
  function act(on: Agency, chosen: Decision, changes: Partial<LiteActInput> = {}, actDeps = deps()) {
    return on.inOrg(async (tx) => {
      const situation = await situationOf(
        tx,
        { index: indexOf(on), answers: {}, facts: chosen.facts, today: liteToday, now: liteTurnAt },
        [],
      );
      return actOnMove(tx, actDeps, { ...actInput(on, chosen, situation), ...changes });
    });
  }
  const indexOf = (on: Agency): PackageIndexEntry[] => [
    {
      id: on.packageId,
      title: "Kedarnath Yatra 4N",
      place: "Kedarnath",
      destinationId: on.destinationId,
      nights: 4,
      startCity: "Delhi",
    },
  ];
  const actInput = (on: Agency, chosen: Decision, situation: Situation): LiteActInput => ({
    organizationId: on.organizationId,
    conversationId: on.chat.id,
    token: on.message.id,
    kind: "reply",
    now: liteTurnAt,
    today: liteToday,
    timeZone: "Asia/Kolkata",
    decision: chosen,
    language: "english",
    reply: null,
    situation,
    checked: null,
    model: null,
    agencyName: "Sharma Holidays",
  });
  const outbound = (on: Agency) =>
    on.inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: on.chat.id, direction: "out" },
        orderBy: { createdAt: "asc" },
        select: { clientToken: true, body: true, caption: true, kind: true },
      }),
    );
  const counts = (on: Agency) =>
    on.inOrg(async (tx) => ({
      holds: await tx.departureHold.count({ where: { leadId: on.leadId, status: "active" } }),
      bookings: await tx.aiBooking.count({ where: { leadId: on.leadId } }),
      sent: await tx.whatsappMessage.count({ where: { conversationId: on.chat.id, direction: "out" } }),
    }));
  const nothingKept = { holds: 0, bookings: 0, sent: 0 };
  const aDayLater = new Date(liteTurnAt.getTime() + 86_400_000);
  /** Seats held on the first departure for a lead, as staff hold them (another lead's by default). */
  const holdSeats = (on: Agency, seats: number, leadId?: string) =>
    on.inOrg(async (tx) =>
      tx.departureHold.create({
        data: {
          departureId: on.departures[0]?.id ?? "",
          leadId: leadId ?? (await aLead(tx)).id,
          seats,
          expiresAt: aDayLater,
        },
      }),
    );
  /** After the first turn's reply, the customer's next line, and the turn that answers it. */
  const afterReply = new Date(liteTurnAt.getTime() + 30_000);
  const nextTurnAt = new Date(liteTurnAt.getTime() + 60_000);
  /** The customer writes again after the reply: the line the next turn answers. */
  async function laterLine(on: Agency, text: string) {
    await on.say(text, "text", afterReply);
    return on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
  }
  const lapseHolds = (on: Agency) =>
    on.inOrg((tx) => tx.departureHold.updateMany({ where: { leadId: on.leadId }, data: { expiresAt: testNow } }));

  it("book holds, books and sends the money message", async () => {
    const on = await liteAgency(test);
    const token = on.message.id;
    const result = done(await act(on, decision(book(on), pricedFacts(on))));
    const sent = await outbound(on);
    expect(sent.map((message) => message.clientToken)).toEqual([`ai:${token}`, `ai:${token}:qr`, `ai:${token}:pay`]);
    expect(sent[0]?.body).toContain(formatRupees(400_000));
    expect(sent[0]?.body).toContain(formatRupees(1_399_800));
    expect(sent[0]?.body).toContain("until");
    expect(sent[1]).toMatchObject({ kind: "image", caption: null });
    expect(sent[2]?.body?.startsWith("Payment details:")).toBe(true);
    expect(sent[2]?.body).toContain("UPI: sharma@okbank");
    expect(sent[2]?.body).toContain("IFSC: HDFC0000001");
    const rows = await on.inOrg(async (tx) => ({
      holds: await tx.departureHold.findMany({ where: { leadId: on.leadId } }),
      bookings: await tx.aiBooking.findMany({ where: { leadId: on.leadId } }),
      lead: await tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }),
      moved: await tx.leadTimelineEntry.findMany({ where: { leadId: on.leadId, kind: "stage-changed" } }),
      facts: await readLiteFacts(tx, on.chat.id),
    }));
    expect(rows.holds).toHaveLength(1);
    expect(rows.holds[0]).toMatchObject({ seats: 2, status: "active", departureId: on.departures[0]?.id });
    expect(rows.bookings).toHaveLength(1);
    expect(rows.bookings[0]).toMatchObject({ id: result.bookingId, expectedPaise: 400_000n });
    expect(rows.lead.stage).toBe("booking_requested");
    expect(rows.moved.some((entry) => entry.stage === "booking_requested" && entry.byAi)).toBe(true);
    expect(rows.facts.bookingId).toBe(result.bookingId);
    expect(result.sentIds).toHaveLength(3);
    expect(result.actions).toContain("booking");
  });

  it("pay in full asks the total", async () => {
    const on = await liteAgency(test);
    await act(on, decision(book(on), pricedFacts(on, { payInFull: true })));
    const [reply] = await outbound(on);
    expect(reply?.body).toContain(formatRupees(1_399_800));
    expect(reply?.body).not.toContain(formatRupees(400_000));
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { leadId: on.leadId } }));
    expect(booking.expectedPaise).toBe(1_399_800n);
  });

  it("the payment details again name the booking's own amount and total", async () => {
    const on = await liteAgency(test);
    done(await act(on, decision(book(on), pricedFacts(on))));
    await on.say("Please send the payment details again", "text", afterReply);
    const later = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
    const kept = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    const again = done(await act(on, decision({ kind: "resend_payment" }, kept), { token: later.id, now: nextTurnAt }));
    expect(again.bookingId).toBeNull();
    const sent = (await outbound(on)).filter((message) => message.clientToken?.startsWith(`ai:${later.id}`));
    expect(sent.map((message) => message.clientToken)).toEqual([
      `ai:${later.id}`,
      `ai:${later.id}:qr`,
      `ai:${later.id}:pay`,
    ]);
    expect(sent[0]?.body).toBe(
      fixedText("payment_again", "english", { amount: formatRupees(400_000), total: formatRupees(1_399_800) }).text,
    );
    expect(await counts(on)).toMatchObject({ holds: 1, bookings: 1 });
  });

  it("the same token again sends nothing", async () => {
    const on = await liteAgency(test);
    const chosen = decision(book(on), pricedFacts(on));
    done(await act(on, chosen));
    const before = await outbound(on);
    expect(await act(on, chosen)).toBe("already");
    expect(await outbound(on)).toEqual(before);
    expect(await counts(on)).toEqual({ holds: 1, bookings: 1, sent: 3 });
  });

  it("a newer line during the turn sends nothing", async () => {
    const on = await liteAgency(test);
    // The customer writes again while the model is still writing for the first line: that line's own turn answers both.
    await on.say("Also, is food included?", "text", new Date(testNow.getTime() + 30_000));
    const refused = await act(on, decision(book(on), pricedFacts(on))).catch(failure);
    expect(refused).toBe("NEWER_MESSAGE");
    expect(await counts(on)).toEqual(nothingKept);
  });

  /** Pauses the agent for this agency, from the platform's own connection, as platform staff do. */
  async function pause(on: Agency) {
    const plan = await platform.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm", "inbox", "ai"],
      },
    });
    await platform.subscription.create({
      data: {
        organizationId: on.organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: testNow,
        trialEndsOn: new Date("2099-01-01"),
        aiAgentPausedAt: testNow,
        aiAgentPausedBy: randomUUID(),
      },
    });
  }

  it("a pause before sending sends nothing", async () => {
    const on = await liteAgency(test);
    await pause(on);
    const refused = await act(on, decision(book(on), pricedFacts(on))).catch(failure);
    expect(refused).toBe("AGENT_PAUSED");
    expect(await counts(on)).toEqual(nothingKept);
  });

  it("a paused turn copies no file into storage: the pause is read before anything is sent", async () => {
    const on = await liteAgency(test);
    await pause(on);
    let copies = 0;
    const counting = {
      ...deps(),
      files: new Proxy(test.files, {
        get(target, name) {
          const value: unknown = Reflect.get(target, name);
          if (name !== "copyFileIn" || typeof value !== "function") return value;
          return (...args: unknown[]) => {
            copies += 1;
            return (value as (...given: unknown[]) => unknown).apply(target, args);
          };
        },
      }),
    };
    const refused = await act(on, decision(book(on), pricedFacts(on)), {}, counting).catch(failure);
    expect(refused).toBe("AGENT_PAUSED");
    expect(copies).toBe(0);
  });

  it("a take-over that lands while act works sends nothing: the chat is read again before the end", async () => {
    const on = await liteAgency(test);
    // The chat's AI row, as the customer's message left it (queued for this turn).
    await on.inOrg((tx) => tx.aiChat.create({ data: { conversationId: on.chat.id, turnState: "thinking" } }));
    const chosen = decision(book(on), pricedFacts(on));
    // The booking asks who to tell partway through act: a person takes the chat over then, from another connection.
    const takeOver = async () => {
      await platform.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { organizationId: on.organizationId, conversationId: on.chat.id, mode: "off" },
        update: { mode: "off" },
      });
      return [];
    };
    const refused = await act(on, chosen, {}, { ...deps(), recipients: takeOver }).catch(failure);
    expect(refused).toBe("AGENT_STOPPED");
    expect(await counts(on)).toEqual(nothingKept);
  });

  it("a pause that lands while act works sends nothing: it is read again just before the end", async () => {
    const on = await liteAgency(test);
    const chosen = decision(book(on), pricedFacts(on));
    // The booking asks who to tell partway through act: the pause lands then, from another connection.
    const pausing = { ...deps(), recipients: async () => (await pause(on), []) };
    const refused = await act(on, chosen, {}, pausing).catch(failure);
    expect(refused).toBe("AGENT_PAUSED");
    expect(await counts(on)).toEqual(nothingKept);
  });

  it("a staff reply since the turn began ends it quietly: nothing is sent or kept", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi Rahul, I'll call you in five minutes.",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 20_000),
        },
      }),
    );
    expect(await act(on, decision(book(on), pricedFacts(on)))).toEqual({ stopped: "answered" });
    expect(await counts(on)).toEqual({ ...nothingKept, sent: 1 });
  });

  it("a take-over or the owner's switch since the turn began ends it quietly", async () => {
    const taken = await liteAgency(test);
    await taken.inOrg((tx) => tx.aiChat.create({ data: { conversationId: taken.chat.id, mode: "off" } }));
    expect(await act(taken, decision(book(taken), pricedFacts(taken)))).toEqual({ stopped: "off" });
    expect(await counts(taken)).toEqual(nothingKept);

    const switched = await liteAgency(test);
    await switched.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    expect(await act(switched, decision(book(switched), pricedFacts(switched)))).toEqual({ stopped: "off" });

    const lite = await liteAgency(test);
    await lite.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { lite: false } }));
    expect(await act(lite, decision(book(lite), pricedFacts(lite)))).toEqual({ stopped: "off" });
    expect(await counts(lite)).toEqual(nothingKept);
  });

  it("cleared payment details or an unsold package stop the booking", async () => {
    const cleared = await liteAgency(test);
    await cleared.inOrg(async (tx) => {
      await tx.organizationProfile.update({
        where: { organizationId: cleared.organizationId },
        data: { upiId: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankIfsc: null },
      });
      await tx.attachment.updateMany({ where: { recordType: "agency_payment_qr" }, data: softDeleted(randomUUID()) });
    });
    expect(await act(cleared, decision(book(cleared), pricedFacts(cleared))).catch(failure)).toBe(
      "PAYMENT_DETAILS_MISSING",
    );
    expect(await counts(cleared)).toEqual(nothingKept);

    const unsold = await liteAgency(test);
    await unsold.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: unsold.packageId }, data: { aiSellable: false } }),
    );
    expect(await act(unsold, decision(book(unsold), pricedFacts(unsold))).catch(failure)).toBe("PACKAGE_NOT_SELLABLE");
    expect(await counts(unsold)).toEqual(nothingKept);
  });

  it("a hold of fewer seats than the party is no hold: nothing is said, booked or sent", async () => {
    const on = await liteAgency(test);
    // Staff held one seat for the lead earlier; now two book.
    await holdSeats(on, 1, on.leadId);
    expect(await act(on, decision(book(on), pricedFacts(on))).catch(failure)).toBe("HOLD_EXISTS");
    expect(await counts(on)).toEqual({ holds: 1, bookings: 0, sent: 0 });
  });

  it("seats sold meanwhile or a changed price stop the booking", async () => {
    const full = await liteAgency(test);
    await holdSeats(full, 11);
    expect(await act(full, decision(book(full), pricedFacts(full))).catch(failure)).toBe("NOT_ENOUGH_SEATS");
    expect(await counts(full)).toEqual(nothingKept);

    const repriced = await liteAgency(test);
    await repriced.inOrg((tx) =>
      tx.packageSeason.updateMany({ where: { templateId: repriced.packageId }, data: { priceDoublePaise: 749_900n } }),
    );
    expect(await act(repriced, decision(book(repriced), pricedFacts(repriced))).catch(failure)).toBe(
      "TOLD_TOTAL_CHANGED",
    );
    expect(await counts(repriced)).toEqual(nothingKept);
  });

  it("a lapsed hold is taken again before the payment details go again", async () => {
    const on = await liteAgency(test);
    const first = done(await act(on, decision(book(on), pricedFacts(on))));
    await lapseHolds(on);
    const later = await laterLine(on, "Please send the payment details again");
    const kept = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    const again = done(await act(on, decision({ kind: "resend_payment" }, kept), { token: later.id, now: nextTurnAt }));
    expect(again.bookingId).not.toBeNull();
    expect(again.bookingId).not.toBe(first.bookingId);
    const sent = (await outbound(on)).filter((message) => message.clientToken?.startsWith(`ai:${later.id}`));
    expect(sent.map((message) => message.clientToken)).toEqual([
      `ai:${later.id}`,
      `ai:${later.id}:qr`,
      `ai:${later.id}:pay`,
    ]);
    expect(sent[0]?.body).toContain("until");
    expect(sent[0]?.body).toContain(formatRupees(400_000));
    const rows = await on.inOrg(async (tx) => ({
      holds: await tx.departureHold.findMany({ where: { leadId: on.leadId, status: "active" } }),
      bookings: await tx.aiBooking.findMany({ where: { leadId: on.leadId }, orderBy: { createdAt: "asc" } }),
    }));
    expect(rows.holds).toHaveLength(1);
    expect(rows.holds[0]?.expiresAt.getTime()).toBeGreaterThan(liteTurnAt.getTime());
    expect(rows.bookings.map((booking) => [booking.id, booking.status, booking.expectedPaise])).toEqual([
      [first.bookingId, "cancelled", 400_000n],
      [again.bookingId, "awaiting_payment", 400_000n],
    ]);
  });

  it("the payment details go again only while the hold covers the booking's own party, whatever the facts say now", async () => {
    const on = await liteAgency(test);
    done(await act(on, decision(book(on), pricedFacts(on))));
    // The hold now covers one seat of the two booked, and the facts (wrongly) say one traveller.
    await on.inOrg((tx) => tx.departureHold.updateMany({ where: { leadId: on.leadId }, data: { seats: 1 } }));
    const later = await laterLine(on, "Please send the payment details again");
    const kept = { ...(await on.inOrg((tx) => readLiteFacts(tx, on.chat.id))), adults: 1 };
    const refused = await act(on, decision({ kind: "resend_payment" }, kept), {
      token: later.id,
      now: nextTurnAt,
    }).catch(failure);
    // The short hold is no hold of the booking's two seats, so it is taken again as a booking (never the payment details
    // alone), here for the one adult the facts now say in a double, which no room fits: refused, nothing sent.
    expect(refused).toBe("ROOM_SPLIT");
    const sent = (await outbound(on)).filter((message) => message.clientToken?.startsWith(`ai:${later.id}`));
    expect(sent).toHaveLength(0);
  });

  it("a lapsed hold whose price has changed stops the payment details going again", async () => {
    const on = await liteAgency(test);
    done(await act(on, decision(book(on), pricedFacts(on))));
    await lapseHolds(on);
    await on.inOrg((tx) =>
      tx.packageSeason.updateMany({ where: { templateId: on.packageId }, data: { priceDoublePaise: 749_900n } }),
    );
    const later = await laterLine(on, "Please send the payment details again");
    const kept = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    const refused = await act(on, decision({ kind: "resend_payment" }, kept), {
      token: later.id,
      now: nextTurnAt,
    }).catch(failure);
    expect(refused).toBe("TOLD_TOTAL_CHANGED");
    // All rolled back: the lapsed hold as it was, the first booking still waiting, nothing more sent.
    expect(await counts(on)).toEqual({ holds: 1, bookings: 1, sent: 3 });
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { leadId: on.leadId } }));
    expect(booking.status).toBe("awaiting_payment");
  });

  it("a lapsed hold whose seats are gone stops the payment details going again", async () => {
    const on = await liteAgency(test);
    done(await act(on, decision(book(on), pricedFacts(on))));
    await lapseHolds(on);
    await holdSeats(on, 11);
    const later = await laterLine(on, "Please send the payment details again");
    const kept = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    const refused = await act(on, decision({ kind: "resend_payment" }, kept), {
      token: later.id,
      now: nextTurnAt,
    }).catch(failure);
    expect(refused).toBe("NOT_ENOUGH_SEATS");
    expect(await counts(on)).toEqual({ holds: 1, bookings: 1, sent: 3 });
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { leadId: on.leadId } }));
    expect(booking.status).toBe("awaiting_payment");
  });

  it("a silent move sends nothing and counts no reply", async () => {
    const on = await liteAgency(test);
    const facts = { ...liteFacts.parse({ agent: "lite" }), lastMove: "silent" };
    const result = done(await act(on, decision({ kind: "silent" }, facts, { stopFollowUps: true })));
    expect(result).toMatchObject({ sentIds: [], bookingId: null, handedOver: false });
    expect(await counts(on)).toEqual(nothingKept);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(chat).toMatchObject({ lastReplyAt: null, repliesOn: null, repliesCount: 0, followUpAt: null });
  });

  it("a hand-over sends the fixed line and tells the owner", async () => {
    const on = await liteAgency(test);
    const facts = { ...liteFacts.parse({ agent: "lite" }), language: "hindi" as const, lastMove: "hand_over" };
    const handed = decision({ kind: "hand_over", reason: "voice_note" }, facts, {
      note: "handed_over",
      stageTo: "contacted",
    });
    const result = done(await act(on, handed, { language: "hindi" }));
    expect(result.handedOver).toBe(true);
    const sent = await outbound(on);
    expect(sent.map((message) => message.body)).toEqual([fixedText("voice_note", "hindi", {}).text]);
    const rows = await on.inOrg(async (tx) => ({
      chat: await tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }),
      waiting: (await tx.whatsappConversation.findUniqueOrThrow({ where: { id: on.chat.id } })).needsReply,
      notices: await tx.notification.findMany({ where: { kind: "ai.handoff" } }),
      notes: await tx.leadNote.findMany({ where: { leadId: on.leadId, byAi: true } }),
    }));
    expect(rows.chat.handedOffAt).toEqual(liteTurnAt);
    expect(rows.chat.handoffReason).toBe("Sent a voice note, which the AI can't listen to yet.");
    expect(rows.chat.followUpAt).toBeNull();
    // Handed to a person: the chat still waits for one.
    expect(rows.waiting).toBe(true);
    expect(rows.notices).toHaveLength(1);
    expect(rows.notices[0]?.body).toBe("Sent a voice note, which the AI can't listen to yet.");
    expect(rows.notes.map((note) => note.body)).toEqual([
      "Handed to the team: Sent a voice note, which the AI can't listen to yet.",
    ]);
  });

  it("a move with no words to send hands over instead of sending nothing", async () => {
    const on = await liteAgency(test);
    const facts = { ...liteFacts.parse({ agent: "lite" }), packageId: on.packageId };
    const result = done(
      await act(on, decision({ kind: "answer_package", packageId: on.packageId, ask: null }, facts), { reply: null }),
    );
    expect(result.handedOver).toBe(true);
    expect((await outbound(on)).map((message) => message.body)).toEqual([fixedText("hand_over", "english", {}).text]);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(chat.handoffReason).toBe("Asked something your setup doesn't answer.");
  });

  it("a picked package sends its brochure and photos once", async () => {
    const on = await liteAgency(test);
    const facts = { ...liteFacts.parse({ agent: "lite" }), packageId: on.packageId, lastMove: "answer_package" };
    const picked = (token: string) =>
      act(
        on,
        decision({ kind: "answer_package", packageId: on.packageId, ask: "when" }, facts, { note: "package_picked" }),
        {
          token,
          reply: { text: "Kedarnath Yatra 4N is a 4-night trip from Delhi. When would you like to go?", filled: [] },
        },
      );
    const first = done(await picked(on.message.id));
    expect((await outbound(on)).map((message) => [message.clientToken, message.kind])).toEqual([
      [`ai:${on.message.id}`, "text"],
      [`ai:${on.message.id}:f1`, "document"],
      [`ai:${on.message.id}:f2`, "image"],
      [`ai:${on.message.id}:f3`, "image"],
    ]);
    expect(first.sentIds).toHaveLength(4);
    const kept = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    expect(kept.sentFileIds).toHaveLength(3);

    // The customer writes again; the same package picked again sends no file twice.
    await on.say("Which dates?", "text", afterReply);
    const later = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
    const again = done(
      await act(
        on,
        decision({ kind: "answer_package", packageId: on.packageId, ask: "when" }, kept, { note: "package_picked" }),
        {
          token: later.id,
          now: nextTurnAt,
          reply: { text: "We go every Saturday this month. Which date suits you?", filled: [] },
        },
      ),
    );
    expect(again.sentIds).toHaveLength(1);
    expect((await outbound(on)).filter((message) => message.clientToken?.startsWith(`ai:${later.id}`))).toHaveLength(1);
  });

  it("the lead gets the AI's fields, name, stage, note, insight, and the chat its summary", async () => {
    const on = await liteAgency(test);
    const facts = { ...liteFacts.parse({ agent: "lite" }), packageId: on.packageId, adults: 2, name: "Riya Sharma" };
    const result = done(
      await act(
        on,
        decision({ kind: "answer_package", packageId: on.packageId, ask: "when" }, facts, {
          note: "package_picked",
          stageTo: "contacted",
          task: "call_back",
        }),
        {
          reply: { text: "It is a 4-night trip from Delhi. When would you like to go?", filled: [] },
          checked: checkedForm("Wants Kedarnath for two, ₹20,000 budget"),
          model: "test-model",
        },
      ),
    );
    const rows = await on.inOrg(async (tx) => ({
      lead: await tx.lead.findUniqueOrThrow({ where: { id: on.leadId }, include: { person: true } }),
      moved: await tx.leadTimelineEntry.findMany({ where: { leadId: on.leadId, kind: "stage-changed" } }),
      notes: await tx.leadNote.findMany({ where: { leadId: on.leadId, byAi: true } }),
      tasks: await tx.task.findMany({ where: { recordId: on.leadId, byAi: true } }),
      insight: await tx.leadAiInsight.findFirst({ where: { leadId: on.leadId } }),
      chat: await tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }),
    }));
    expect(rows.lead).toMatchObject({ adults: 2, stage: "contacted", destinationId: on.destinationId });
    expect(rows.lead.person.name).toBe("Riya Sharma");
    expect(rows.moved).toMatchObject([{ stage: "contacted", byAi: true }]);
    expect(rows.notes.map((note) => note.body)).toEqual(["Interested in Kedarnath Yatra 4N."]);
    expect(rows.tasks.map((task) => task.title)).toEqual(["Call Riya Sharma: asked for a call"]);
    expect(rows.tasks[0]?.dueAt).toEqual(new Date(liteTurnAt.getTime() + 3_600_000));
    expect(rows.insight).toMatchObject({ score: 72, label: "hot", model: "test-model" });
    expect(rows.chat.summary).toContain("Wants Kedarnath for two");
    expect(rows.chat.summary).not.toContain("20,000");
    expect(rows.chat).toMatchObject({ lastReplyAt: liteTurnAt, repliesCount: 1, followUpAt: null, handedOffAt: null });
    expect(result.actions).toEqual(
      expect.arrayContaining(["lead:adults", "name", "stage:contacted", "note:package_picked", "task:call_back"]),
    );
  });
});
