// The natural turn's live reads (plan 2, Task 4) against the real database: the chat's lines labelled for the model, the
// facts a chat keeps when the agent changes, lite's gates with the day's cap and the month's limit handed back as data,
// and the lead as a person left it.
import { randomUUID } from "node:crypto";
import { PACKAGE_BROCHURE_RECORD_TYPE } from "@travel-crm/contracts/files";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/index.js";
import { writeAiTripFields } from "../../../src/ai/lite/lead-writes.js";
import { prepareLiteTurn } from "../../../src/ai/lite/prepare.js";
import { replyDayOf } from "../../../src/ai/may-write.js";
import { EARLIER_AGENTS_UNTIL } from "../../../src/ai/natural/chat-lines.js";
import type { NaturalPrepared } from "../../../src/ai/natural/prepare.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { storeAutopilot } from "../support/store-autopilot.js";
import { liveAgency, liveAt, liveNow, type LiveAgency } from "./support/live-agency.js";

const HOUR_MS = 3_600_000;
/** An hour before the move to one agent: an AI line then is an earlier assistant's. */
const beforeTheMove = new Date(EARLIER_AGENTS_UNTIL.getTime() - HOUR_MS);

describe("the natural turn's live reads", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** What the turn read; a test that expects it to end says so. */
  const preparedOf = async (on: LiveAgency, at = liveNow): Promise<NaturalPrepared> => {
    const outcome = await on.prepare(at);
    if (typeof outcome === "string") throw new Error(`The turn ended: ${outcome}`);
    return outcome;
  };
  /** The outcome of each agent's prepare on the chat as it is now: the natural one's, then lite's. */
  const bothEnd = async (on: LiveAgency) => {
    const natural = await on.prepare();
    const lite = await prepareLiteTurn(on.dependencies(), on.turnInput(), liveNow);
    return [typeof natural === "string" ? natural : "prepared", typeof lite === "string" ? lite : "prepared"];
  };
  const brochureOf = (on: LiveAgency, packageId: string) =>
    on.inOrg(async (tx) => {
      const where = { recordType: PACKAGE_BROCHURE_RECORD_TYPE, recordId: packageId };
      return (await tx.attachment.findFirstOrThrow({ where, select: { id: true } })).id;
    });
  const storeFacts = (on: LiveAgency, facts: object) =>
    on.inOrg(async (tx) => {
      const row = await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { id: true } });
      if (row === null) await tx.aiChat.create({ data: { conversationId: on.chat.id, facts } });
      else await tx.aiChat.update({ where: { id: row.id }, data: { facts } });
    });

  it("labels customer, our, team, earlier and automatic lines", async () => {
    const on = await liveAgency(test);
    await on.write({ direction: "out", at: beforeTheMove, body: "Kedarkantha is ₹8,000!", clientToken: "ai:old-turn" });
    await on.write({ direction: "out", at: liveAt(-3600), body: "Thanks for writing! We reply 9 am to 9 pm." });
    await on.write({
      direction: "out",
      at: liveAt(-1800),
      origin: "staff_crm",
      sentBy: on.amit.userId,
      body: "The 12 Dec batch has seats.",
    });
    await on.write({ direction: "out", at: liveAt(-1500), origin: "staff_phone", body: "Call me on this number." });
    // A cancelled broadcast's send, recalled before it went: the customer never saw it.
    await on.write({
      direction: "out",
      at: liveAt(-1200),
      origin: "staff_crm",
      sentBy: on.owner.userId,
      body: "Flat 20% off this weekend!",
      status: "superseded",
    });
    await on.write({
      direction: "out",
      at: liveAt(-100),
      body: "Every Saturday in December!",
      clientToken: "ai:turn-1",
    });
    await on.write({ direction: "in", at: liveAt(-30), body: "2 log" });

    const { lines } = await preparedOf(on);

    expect(lines.map((line) => [line.from, line.text])).toEqual([
      ["earlier", "Kedarkantha is ₹8,000!"],
      ["automatic", "Thanks for writing! We reply 9 am to 9 pm."],
      ["team", "The 12 Dec batch has seats."],
      ["team", "Call me on this number."],
      ["customer", "Hi, Kedarkantha in December?"],
      ["you", "Every Saturday in December!"],
      ["customer", "2 log"],
    ]);
    expect(lines.every((line) => line.action === undefined)).toBe(true);
  });

  it("marks AI files, payment lines and the QR as sent actions", async () => {
    const on = await liveAgency(test);
    await on.write({ direction: "out", at: beforeTheMove, body: "UPI: old@okbank", clientToken: "ai-pay:old-turn" });
    await on.write({
      direction: "out",
      at: new Date(beforeTheMove.getTime() + 1000),
      kind: "document",
      caption: "Kedarkantha, ₹8,000 on 12 Dec",
      fileName: "old.pdf",
      clientToken: "ai:old-turn:f1",
    });
    await on.write({
      direction: "out",
      at: liveAt(-100),
      body: "Here's the Kedarkantha trek.",
      clientToken: "ai:turn-1",
    });
    await on.write({
      direction: "out",
      at: liveAt(-99),
      kind: "document",
      caption: "Kedarkantha Trek",
      fileName: "brochure.pdf",
      clientToken: "ai:turn-1:f1",
    });
    await on.write({
      direction: "out",
      at: liveAt(-98),
      kind: "image",
      fileName: "summit.jpg",
      clientToken: "ai:turn-1:f2",
    });
    await on.write({ direction: "out", at: liveAt(-97), body: "UPI: casetrips@okbank", clientToken: "ai:turn-1:pay" });
    await on.write({
      direction: "out",
      at: liveAt(-96),
      kind: "image",
      fileName: "qr.png",
      clientToken: "ai:turn-1:qr",
    });
    await on.write({ direction: "in", at: liveAt(-30), body: "ok" });

    const { lines } = await preparedOf(on);

    expect(lines.filter((line) => line.from !== "customer").map((line) => [line.from, line.action ?? null])).toEqual([
      ["earlier", "sent: payment details"],
      ["earlier", "sent: Kedarkantha, on"],
      ["you", null],
      ["you", "sent: Kedarkantha Trek"],
      ["you", "sent: summit.jpg"],
      ["you", "sent: payment details"],
      ["you", "sent: payment details"],
    ]);
  });

  it("flags a new photo as a possible payment where one is likely, and a voice note with no words", async () => {
    const on = await liveAgency(test);
    const older = await on.write({ direction: "in", at: liveAt(-900), kind: "image" });
    await on.write({ direction: "out", at: liveAt(-600), body: "UPI: casetrips@okbank", clientToken: "ai:turn-1:pay" });
    const photo = await on.write({ direction: "in", at: liveAt(-60), kind: "image" });
    const voice = await on.write({ direction: "in", at: liveAt(-30), kind: "audio" });

    const { lines } = await preparedOf(on);
    const line = (id: string) => lines.find((one) => one.id === id);

    expect(line(photo)).toMatchObject({ from: "customer", kind: "image", mayBePayment: true });
    // A photo an earlier line answered is old, whatever it was.
    expect(line(older)?.mayBePayment).toBeUndefined();
    expect(line(voice)).toMatchObject({ untranscribed: true });
    expect(line(voice)?.mayBePayment).toBeUndefined();
    expect(line(on.message.id)?.untranscribed).toBeUndefined();

    // Nothing to pay in a chat that was never sent payment details, with no quote due: a photo is just a photo.
    const quiet = await liveAgency(test);
    const selfie = await quiet.write({ direction: "in", at: liveAt(-30), kind: "image" });
    expect((await preparedOf(quiet)).lines.find((one) => one.id === selfie)?.mayBePayment).toBeUndefined();
  });

  it("names a team member by first name", async () => {
    const on = await liveAgency(test);
    const team = (seconds: number, sentBy: string, body: string) =>
      on.write({ direction: "out", at: liveAt(seconds), origin: "staff_crm", sentBy, body });
    const byAmit = await team(-3000, on.amit.userId, "Amit here: seats on the 12th.");
    const byAsha = await team(-2900, on.owner.userId, "Asha here.");
    const byFormer = await team(-2800, randomUUID(), "From someone who left.");
    await on.write({ direction: "in", at: liveAt(-30), body: "thanks" });
    const { leadId } = on;
    await on.inOrg(async (tx) => {
      await tx.leadNote.create({
        data: { leadId, body: "Prefers a weekend batch.", createdBy: on.amit.userId, createdAt: liveAt(-7200) },
      });
      await tx.leadTimelineEntry.create({
        data: {
          leadId,
          kind: "stage-changed",
          stage: "contacted",
          actorUserId: on.owner.userId,
          occurredAt: liveAt(-3600),
        },
      });
    });

    const { lines, lead } = await preparedOf(on);
    const nameOf = (id: string) => lines.find((one) => one.id === id)?.teamName;

    expect([nameOf(byAmit), nameOf(byAsha), nameOf(byFormer)]).toEqual(["Amit", "Asha", undefined]);
    expect(lead.teamNotes).toEqual([
      { at: liveAt(-3600), by: "Asha", text: "moved the lead to Contacted" },
      { at: liveAt(-7200), by: "Amit", text: "Prefers a weekend batch." },
    ]);
  });

  it("starts fresh facts on a chat lite answered, keeping the files it sent", async () => {
    const on = await liveAgency(test);
    const [kedarkantha = ""] = on.packageIds;
    const brochure = await brochureOf(on, kedarkantha);
    const lite = {
      agent: "lite",
      packageId: kedarkantha,
      adults: 2,
      sentFileIds: [brochure],
      bookingId: randomUUID(),
      lastMove: "give_price",
      leadId: on.leadId,
    };
    await storeFacts(on, lite);

    expect((await preparedOf(on)).facts).toEqual({
      agent: "natural",
      leadId: on.leadId,
      sentTripIds: [kedarkantha],
      sentFileIds: [brochure],
      offer: null,
      told: [],
      bookingId: null,
      lastTurnAt: null,
    });

    // Natural, then lite, then natural again: lite's facts never held the brochure the natural agent sent, but the chat
    // shows it, captioned with the trip's title. Lite's files go uncaptioned; an earlier assistant's caption is no trip's.
    const file = (at: Date, clientToken: string, caption?: string) =>
      on.write({
        direction: "out",
        at,
        kind: "document",
        fileName: "brochure.pdf",
        clientToken,
        ...(caption === undefined ? {} : { caption }),
      });
    await file(beforeTheMove, "ai:old-turn:f1", "Brahmatal Trek");
    await file(liveAt(-3600), "ai:turn-1:f1", "Kedarkantha Trek");
    await file(liveAt(-1800), "ai:turn-2:f1");
    await storeFacts(on, { agent: "lite", lastMove: "greet", sentFileIds: [], leadId: on.leadId });
    expect((await preparedOf(on)).facts).toMatchObject({ sentTripIds: [kedarkantha], sentFileIds: [] });

    // Lite's files for another lead were a past trip's, by lite's own rule; an older agent's row reads as nothing.
    await storeFacts(on, { ...lite, leadId: randomUUID() });
    expect((await preparedOf(on)).facts).toMatchObject({ sentTripIds: [], sentFileIds: [] });
    await storeFacts(on, { places: ["Manali"], budget: 20000 });
    expect((await preparedOf(on)).facts).toMatchObject({ agent: "natural", leadId: on.leadId, sentFileIds: [] });
  });

  it("keeps a natural chat's facts, and resets its trip facts when the lead changed", async () => {
    const on = await liveAgency(test);
    const [kedarkantha = ""] = on.packageIds;
    const brochure = await brochureOf(on, kedarkantha);
    const lastTurnAt = liveAt(-3600).toISOString();
    const facts = {
      agent: "natural",
      leadId: on.leadId,
      sentTripIds: [kedarkantha],
      sentFileIds: [brochure],
      offer: {
        packageId: kedarkantha,
        startsOn: "2026-12-12",
        adults: 2,
        childrenAges: [],
        room: "triple",
        payInFull: false,
        departureId: randomUUID(),
        totalPaise: 1_899_800,
        advancePaise: 600_000,
        at: lastTurnAt,
      },
      told: [
        {
          packageId: kedarkantha,
          startsOn: "2026-12-12",
          adults: 2,
          childrenAges: [],
          room: "triple",
          totalPaise: 1_899_800,
          at: lastTurnAt,
        },
      ],
      bookingId: null,
      lastTurnAt,
    };
    await storeFacts(on, facts);

    expect((await preparedOf(on)).facts).toEqual(facts);

    // The trip was won: the customer has no open lead, and the trip's facts go, but not when the last turn ran.
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { stage: "won" } }));
    const fresh = {
      agent: "natural",
      sentTripIds: [],
      sentFileIds: [],
      offer: null,
      told: [],
      bookingId: null,
      lastTurnAt,
    };
    const closed = await preparedOf(on);
    expect(closed.facts).toEqual({ ...fresh, leadId: null });
    expect(closed).toMatchObject({ leadId: null, lead: { stage: "new", packageId: null, openTasks: [] }, typed: {} });

    // Their next enquiry is a new lead: nothing of the last trip comes with it.
    const next = await on.inOrg((tx) => aLead(tx, { personId: on.chat.personId ?? "", stage: "new" }));
    await storeFacts(on, facts);
    expect((await preparedOf(on)).facts).toEqual({ ...fresh, leadId: next.id });
  });

  it("ends the turn as lite does when the agent is off, paused or a person is answering", async () => {
    const on = await liveAgency(test);
    // Someone on the team wrote a minute before the customer: a person is answering.
    await on.write({ direction: "out", at: liveAt(-180), origin: "staff_crm", sentBy: on.amit.userId, body: "Hi!" });
    expect(await bothEnd(on)).toEqual(["person_answering", "person_answering"]);
    // The chat was handed to a person: the AI is paused in it.
    await on.inOrg((tx) => tx.aiChat.create({ data: { conversationId: on.chat.id, handedOffAt: liveAt(-600) } }));
    expect(await bothEnd(on)).toEqual(["handed_off", "handed_off"]);
    // The chat's own switch is off.
    await on.inOrg((tx) => tx.aiChat.updateMany({ data: { mode: "off" } }));
    expect(await bothEnd(on)).toEqual(["off", "off"]);
    // The agency's switch is off.
    await on.inOrg((tx) => tx.aiChat.updateMany({ data: { mode: "default", handedOffAt: null } }));
    await on.inOrg((tx) => storeAutopilot(tx, on.organizationId, { autopilot: false }));
    expect(await bothEnd(on)).toEqual(["off", "off"]);
  });

  it("hands the day cap and the month's limit back as data", async () => {
    const on = await liveAgency(test);
    const cap = await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      await tx.aiUsage.create({ data: { month: monthStartOf(liveNow, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } });
      await tx.aiChat.create({
        data: { conversationId: on.chat.id, repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay },
      });
      return maxRepliesPerDay;
    });

    expect(await preparedOf(on)).toMatchObject({ repliesToday: cap, dayCap: cap, monthFull: true });
    expect(await bothEnd(on)).toEqual(["prepared", "day_limit"]);
  });

  it("reads a person's lead values as typed", async () => {
    const on = await liveAgency(test);
    const [kedarkantha = ""] = on.packageIds;
    const { leadId } = on;
    const place = await on.inOrg(async (tx) => {
      const { destinationId } = await tx.quoteTemplate.findUniqueOrThrow({
        where: { id: kedarkantha },
        select: { destinationId: true },
      });
      // A person typed the place, the month, the party and the pickup; the AI filled the room.
      await tx.lead.update({
        where: { id: leadId },
        data: {
          destinationId,
          travelKind: "month",
          travelMonth: new Date("2026-12-01T00:00:00Z"),
          adults: 3,
          departureCity: "Dehradun",
        },
      });
      const today = parseCalendarDate("2026-11-20");
      await writeAiTripFields(tx, {
        organizationId: on.organizationId,
        leadId,
        values: { room_type: "triple" },
        today,
      });
      return destinationId;
    });

    const { typed, lead } = await preparedOf(on);

    expect(typed).toEqual({
      destination: { kind: "existing", destinationId: place },
      when: { kind: "month", month: "2026-12" },
      adults: 3,
      departure_city: "Dehradun",
    });
    expect(lead).toMatchObject({
      name: "Rahul",
      cameFrom: "WhatsApp profile name",
      packageId: kedarkantha,
      day: null,
      month: "2026-12",
      adults: 3,
      childrenAges: [],
      pickupCity: "Dehradun",
      room: "triple",
      stage: "new",
    });
  });

  it("reads the booking waiting for payment, the agency's details and the ad the chat came from", async () => {
    const on = await liveAgency(test);
    const [kedarkantha = ""] = on.packageIds;
    const booking = await on.inOrg(async (tx) => {
      const ad = await tx.whatsappAd.create({
        data: {
          adKey: "ad-1",
          sourceUrl: "https://www.instagram.com/p/winter-treks",
          packageId: kedarkantha,
          firstSeenAt: liveAt(-HOUR_MS / 1000),
          lastSeenAt: liveAt(-HOUR_MS / 1000),
        },
        select: { id: true },
      });
      await tx.whatsappConversation.update({ where: { id: on.chat.id }, data: { adId: ad.id, lastAdId: ad.id } });
      await tx.task.create({
        data: {
          kind: "task",
          title: "Call about the pickup",
          dueAt: liveAt(3600),
          firstDueAt: liveAt(3600),
          recordType: "lead",
          recordId: on.leadId,
        },
      });
      return tx.aiBooking.create({
        data: {
          leadId: on.leadId,
          conversationId: on.chat.id,
          summary: "Kedarkantha Trek for 2, 12 Dec",
          expectedPaise: 600_000n,
        },
        select: { id: true },
      });
    });

    const prepared = await preparedOf(on);

    expect(prepared).toMatchObject({
      timeZone: "Asia/Kolkata",
      today: "2026-11-20",
      voice: { agentName: "Riya", agencyName: "Case Trips", tone: "friendly" },
      booking: { id: booking.id, awaitingPayment: true, paymentConfirmed: false, confirmed: false },
      paymentReady: true,
      supplierStateCode: "05",
      adPackageId: kedarkantha,
      cameFrom: { source: "Instagram ad", packageId: kedarkantha },
      lead: { openTasks: ["Call about the pickup"] },
      lastInboundAt: liveAt(-120),
      repliesToday: 0,
      monthFull: false,
    });
    expect(prepared.sheets.map((sheet) => sheet.packageId)).toEqual(on.packageIds);
    expect(prepared.chat).toMatchObject({ id: on.chat.id, profileName: "Rahul" });
  });
});
