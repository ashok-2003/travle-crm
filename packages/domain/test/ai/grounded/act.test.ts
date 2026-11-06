// Acting on a checked reply, against the real database: the seats are held, the group quote is made at the total the
// customer was told, the AI's booking points at it, every message carries the AI's token, and a repeat of the turn does nothing.
import { chatFacts, type ChatFacts, type WriteAnswer } from "@travel-crm/contracts/ai";
import { PACKAGE_BROCHURE_RECORD_TYPE, PACKAGE_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actOnReply, type ActResult } from "../../../src/ai/grounded/act.js";
import { buildCard } from "../../../src/ai/grounded/card.js";
import { fillPlaceholders } from "../../../src/ai/grounded/fill.js";
import { lookUp } from "../../../src/ai/grounded/lookup.js";
import { uuidFromKey } from "../../../src/jobs/ids.js";
import { formatRupees, parseCalendarDate } from "../../../src/kernel/index.js";
import { aLead, aPerson } from "../../crm/support/records.js";
import {
  aConnectedAgency,
  createTestInbox,
  testNow,
  type TestConnection,
  type TestInbox,
} from "../../inbox/support.js";

const today = parseCalendarDate("2026-10-23");
const now = testNow;
const day = (text: string) => new Date(`${text}T00:00:00Z`);
const none: WriteAnswer["actions"] = {
  sendFiles: [],
  sendAgencyFiles: false,
  sendPayment: false,
  requestBooking: false,
  flag: null,
  handOver: null,
  note: null,
  task: null,
};

describe("acting on a checked reply", () => {
  let test: TestInbox;
  let agency: TestConnection;
  let counter = 0;
  beforeAll(async () => {
    test = createTestInbox();
    agency = await aConnectedAgency(test);
  });
  afterAll(() => test.close());

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(agency.organizationId, work);
  const deps = () => ({ files: test.files, recipients: () => Promise.resolve([]), supplierStateCode: "27" });

  /** A group package with one open departure, a chat with its lead, and (when asked) a brochure and a payment QR. */
  async function scene(options: { seats?: number; qr?: boolean; brochure?: boolean; paymentText?: string } = {}) {
    counter += 1;
    const ids = await inOrg(async (tx) => {
      const destination = await tx.destination.create({
        data: { name: `Spiti ${String(counter)}` },
        select: { id: true },
      });
      const template = await tx.quoteTemplate.create({
        data: {
          name: `Spiti ${String(counter)}`,
          title: `Spiti ${String(counter)}`,
          kind: "group",
          destinationId: destination.id,
          roomTypes: ["double", "triple"],
          advancePerPersonPaise: 500_000n,
          aiSellable: true,
          nights: 6,
          paymentDetails: options.paymentText ?? "Pay to UPI spiti@bank",
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
      const departure = await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day("2026-11-14"),
          endDate: day("2026-11-20"),
          seatsTotal: options.seats ?? 12,
          templateId: template.id,
        },
        select: { id: true },
      });
      const person = await aPerson(tx);
      const lead = await aLead(tx, { personId: person.id });
      const chat = await tx.whatsappConversation.create({
        data: {
          connectionId: agency.connectionId,
          phoneE164: `+9199${String(counter).padStart(8, "0")}`,
          personId: person.id,
          lastInboundAt: new Date(now.getTime() - 3_600_000),
        },
        select: { id: true },
      });
      return {
        destinationId: destination.id,
        packageId: template.id,
        departureId: departure.id,
        leadId: lead.id,
        chatId: chat.id,
      };
    });
    const file = async (recordType: string, fileName: string, contentType: string) => {
      const row = await inOrg((tx) =>
        tx.attachment.create({
          data: {
            recordType,
            recordId: ids.packageId,
            fileName,
            contentType,
            sizeBytes: 3,
            status: "ready",
            confirmedAt: now,
          },
          select: { id: true, organizationId: true },
        }),
      );
      await test.storage.put({
        key: `organizations/${row.organizationId}/attachments/${row.id}`,
        contentType,
        body: new Uint8Array([1, 2, 3]),
      });
      return row.id;
    };
    const qrId = options.qr === true ? await file(PACKAGE_PAYMENT_QR_RECORD_TYPE, "qr.png", "image/png") : null;
    const brochureId =
      options.brochure === true ? await file(PACKAGE_BROCHURE_RECORD_TYPE, "spiti.pdf", "application/pdf") : null;
    return { ...ids, qrId, brochureId };
  }

  const factsFor = (
    ids: { destinationId: string; packageId: string; departureId?: string },
    changes: Partial<ChatFacts> = {},
  ) =>
    chatFacts.parse({
      places: [{ destinationId: ids.destinationId, words: "Spiti" }],
      startsOn: "2026-11-14",
      travellers: 5,
      rooms: [
        { roomType: "triple", people: 3 },
        { roomType: "double", people: 2 },
      ],
      packageId: ids.packageId,
      ...changes,
    });

  /** The turn's own steps up to acting: look up, build the card, fill the reply the way the check saw it. */
  async function turn(
    ids: Awaited<ReturnType<typeof scene>>,
    reply: string,
    actions: Partial<WriteAnswer["actions"]>,
    token: string,
    facts: ChatFacts = factsFor(ids),
  ) {
    return inOrg(async (tx) => {
      const lookup = await lookUp(tx, facts, today, now, []);
      const text = fillPlaceholders(reply, buildCard(lookup)).text;
      return actOnReply(tx, deps(), {
        organizationId: agency.organizationId,
        conversationId: ids.chatId,
        token,
        text,
        actions: { ...none, ...actions },
        lookup,
        facts,
        now,
      });
    });
  }

  const sentOf = (result: ActResult) => {
    if (result === "already") throw new Error("expected a send");
    return result;
  };
  const outbound = (chatId: string) =>
    inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: chatId, direction: "out" },
        orderBy: { createdAt: "asc" },
        select: { clientToken: true, body: true, caption: true, kind: true },
      }),
    );
  const counts = (ids: Awaited<ReturnType<typeof scene>>) =>
    inOrg(async (tx) => ({
      holds: await tx.departureHold.count({ where: { leadId: ids.leadId, status: "active" } }),
      quotes: await tx.quote.count({ where: { leadId: ids.leadId } }),
      bookings: await tx.aiBooking.count({ where: { leadId: ids.leadId } }),
    }));

  it("a booking request holds the seats, makes the group quote at the told total, and an AI booking with its quote and advance", async () => {
    const ids = await scene({ qr: true });
    const token = "turn-book";
    const result = sentOf(
      await turn(
        ids,
        "Total [total P1]. Advance [advance total P1].",
        { requestBooking: true, sendPayment: true },
        token,
      ),
    );
    expect(result.bookingId).toBe(uuidFromKey(`ai-booking:${token}`));
    const told = await inOrg(async (tx) => (await lookUp(tx, factsFor(ids), today, now, [])).packages[0]?.total);
    expect(told).toBe(3 * 599_900 + 2 * 699_900);
    const rows = await inOrg(async (tx) => ({
      hold: await tx.departureHold.findFirstOrThrow({ where: { leadId: ids.leadId } }),
      quote: await tx.quote.findFirstOrThrow({ where: { leadId: ids.leadId } }),
      booking: await tx.aiBooking.findUniqueOrThrow({ where: { id: result.bookingId ?? "" } }),
      lead: await tx.lead.findUniqueOrThrow({ where: { id: ids.leadId } }),
      audit: await tx.auditEntry.findMany({ where: { action: { in: ["departure.hold-created", "quote.created"] } } }),
    }));
    expect(rows.hold).toMatchObject({ seats: 5, status: "active", departureId: ids.departureId });
    expect(Number(rows.quote.totalPaise)).toBe(told);
    expect(rows.quote).toMatchObject({ departureId: ids.departureId, templateId: ids.packageId });
    expect(rows.booking).toMatchObject({
      status: "awaiting_payment",
      quoteId: rows.quote.id,
      expectedPaise: 2_500_000n,
    });
    expect(rows.lead.stage).toBe("booking_requested");
    // The system made the hold and the quote: no person is named in their audit entries.
    expect(rows.audit.length).toBeGreaterThanOrEqual(2);
    expect(rows.audit.every((entry) => entry.actorUserId === null && entry.source === "job")).toBe(true);
    const saved = await inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: ids.chatId } }));
    expect(saved.facts).toMatchObject({ bookingId: result.bookingId, paymentSentFor: ids.departureId });
  });

  it("the last seats of a departure can be held and quoted together", async () => {
    const ids = await scene({ seats: 5 });
    const result = sentOf(await turn(ids, "Booked.", { requestBooking: true }, "turn-last"));
    expect(result.bookingId).not.toBeNull();
    expect(await counts(ids)).toEqual({ holds: 1, quotes: 1, bookings: 1 });
  });

  it("the same token twice acts once", async () => {
    const ids = await scene({ qr: true, brochure: true });
    const actions = { requestBooking: true, sendPayment: true, sendFiles: ["P1"] };
    const first = await turn(ids, "Total [total P1].", actions, "turn-twice");
    expect(first).not.toBe("already");
    const before = await outbound(ids.chatId);
    expect(await turn(ids, "Total [total P1].", actions, "turn-twice")).toBe("already");
    expect(await outbound(ids.chatId)).toEqual(before);
    expect(await counts(ids)).toEqual({ holds: 1, quotes: 1, bookings: 1 });
  });

  it("no seats left: nothing is sent and nothing is kept, so the turn can flag the team", async () => {
    const ids = await scene({ seats: 6 });
    const facts = factsFor(ids);
    const lookup = await inOrg((tx) => lookUp(tx, facts, today, now, []));
    // Another lead takes three seats between the lookup and the act.
    await inOrg(async (tx) => {
      const other = await aLead(tx, {});
      await tx.departureHold.create({
        data: {
          departureId: ids.departureId,
          leadId: other.id,
          seats: 3,
          expiresAt: new Date(now.getTime() + 3_600_000),
        },
      });
    });
    const failure = await inOrg((tx) =>
      actOnReply(tx, deps(), {
        organizationId: agency.organizationId,
        conversationId: ids.chatId,
        token: "turn-full",
        text: "Booked!",
        actions: { ...none, requestBooking: true },
        lookup,
        facts,
        now,
      }),
    ).then(
      () => null,
      (error: unknown) => (error as { reason?: string }).reason,
    );
    // The quote counts the free seats first, and refuses the party.
    expect(failure).toBe("NOT_ENOUGH_SEATS");
    expect(await outbound(ids.chatId)).toEqual([]);
    expect(await counts(ids)).toEqual({ holds: 0, quotes: 0, bookings: 0 });
  });

  it("every message is marked as the AI's, and the payment text is no longer ai-pay:", async () => {
    const ids = await scene({ qr: true, brochure: true });
    await turn(ids, "Here you go.", { requestBooking: true, sendPayment: true, sendFiles: ["P1"] }, "turn-marked");
    const sent = await outbound(ids.chatId);
    expect(sent.map((message) => message.clientToken)).toEqual([
      "ai:turn-marked",
      "ai:turn-marked:f1",
      "ai:turn-marked:qr",
      "ai:turn-marked:pay",
    ]);
    expect(sent.every((message) => message.clientToken?.startsWith("ai:") === true)).toBe(true);
  });

  it("files go once per chat", async () => {
    const ids = await scene({ brochure: true });
    const first = sentOf(await turn(ids, "The brochure.", { sendFiles: ["P1"] }, "turn-file-1"));
    expect(first.sent.fileIds).toEqual([ids.brochureId]);
    // A fresh lookup no longer lists it, and a stale one is filtered by what the chat has been sent.
    const facts = await inOrg((tx) =>
      tx.aiChat.findFirstOrThrow({ where: { conversationId: ids.chatId } }).then((row) => chatFacts.parse(row.facts)),
    );
    expect(facts.sentFileIds).toEqual([ids.brochureId]);
    const stale = await inOrg(async (tx) => ({
      ...(await lookUp(tx, factsFor(ids), today, now, [])),
    }));
    expect(stale.packages[0]?.brochures.length).toBe(1);
    const second = sentOf(
      await inOrg((tx) =>
        actOnReply(tx, deps(), {
          organizationId: agency.organizationId,
          conversationId: ids.chatId,
          token: "turn-file-2",
          text: "Again.",
          actions: { ...none, sendFiles: ["P1"] },
          lookup: stale,
          facts,
          now,
        }),
      ),
    );
    expect(second.sent.fileIds).toEqual([]);
    const files = (await outbound(ids.chatId)).filter((message) => message.kind === "document");
    expect(files).toHaveLength(1);
  });

  it("the payment text carries the code's advance total, then the package's payment text", async () => {
    const ids = await scene({ qr: true, paymentText: "Pay to UPI spiti@bank" });
    const result = sentOf(await turn(ids, "Pay below.", { sendPayment: true }, "turn-pay"));
    expect(result).toMatchObject({ sent: { qr: true, pay: true }, bookingId: null });
    const pay = (await outbound(ids.chatId)).find((message) => message.clientToken === "ai:turn-pay:pay");
    expect(pay?.body).toBe(`Advance to book: ${formatRupees(2_500_000)}\n\nPay to UPI spiti@bank`);
    const saved = await inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: ids.chatId } }));
    expect(saved.facts).toMatchObject({ paymentSentFor: ids.departureId });
  });
});
