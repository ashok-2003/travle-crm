// The system's side of bookings (release 6): the listeners for "quote.accepted" and "quote.reverted" (a repeat of an event adds
// nothing), the night's Completed, a claim left waiting over a day, what Today shows, and the erasure of a customer's travellers,
// ID numbers, claims, feedback and files.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  bookingsMissingDetails,
  completeFinishedBookings,
  confirmBooking,
  getBooking,
  quoteAcceptedListener,
  quoteRevertedListener,
  raiseStaleClaims,
  submitPaymentClaim,
} from "../../src/bookings/index.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { todaySection, todaySummary } from "../../src/today/index.js";
import { aBooking, aQuote, openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z");
const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

describe("the system's side of bookings", () => {
  let world: World;
  let platformDb: PlatformDatabase;

  beforeAll(async () => {
    world = await openWorld("Booking system");
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await world.close();
  });

  const event = (type: string, payload: Record<string, string | boolean>): DomainEvent => ({
    id: crypto.randomUUID(),
    organizationId: world.organizationId,
    type,
    payload,
    occurredAt: now,
  });
  const context = (): ListenerContext => ({
    actor: systemActor(world.organizationId),
    forOrg: (work) => world.inOrg(work),
  });

  it("makes a booking once from a quote's acceptance, and again changes nothing", async () => {
    const { quote, lead } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId }));
    const accepted = event("quote.accepted", { quoteId: quote.id, leadId: lead.id, confirmed: false });
    await quoteAcceptedListener().handle(accepted, context());
    await quoteAcceptedListener().handle(accepted, context());
    expect(await world.inOrg((tx) => tx.booking.count({ where: { quoteId: quote.id } }))).toBe(1);
    const events = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "booking.created" } }));
    expect(events.length).toBeGreaterThan(0);
  });

  it("removes a booking when its quote reverts, but never a cancelled one", async () => {
    const waiting = await aBooking(world);
    await quoteRevertedListener().handle(event("quote.reverted", { quoteId: waiting.quoteId }), context());
    expect(await world.inOrg((tx) => tx.booking.count({ where: { id: waiting.bookingId } }))).toBe(0);
    expect(
      await world.inOrg((tx) => tx.task.count({ where: { recordId: waiting.bookingId, cancelledAt: null } })),
    ).toBe(0);
    const cancelled = await aBooking(world);
    await world.inOrg((tx) =>
      tx.booking.update({ where: { id: cancelled.bookingId }, data: { status: "cancelled", cancelledAt: now } }),
    );
    await quoteRevertedListener().handle(event("quote.reverted", { quoteId: cancelled.quoteId }), context());
    expect(await world.inOrg((tx) => tx.booking.count({ where: { id: cancelled.bookingId } }))).toBe(1);
  });

  it("marks a trip over the day after its last day Completed, and stops its reminders", async () => {
    const over = await aBooking(world, { startDate: day(-5), days: 2, confirmed: true });
    const still = await aBooking(world, { startDate: day(-1), days: 3, confirmed: true });
    await world.inOrg((tx) =>
      tx.bookingReminder.create({
        data: {
          bookingId: over.bookingId,
          kind: "reporting",
          key: "reporting:-:1",
          sendAt: new Date(now.getTime() + 3_600_000),
        },
      }),
    );
    const completed = await completeFinishedBookings(
      {
        db: world.db,
        appUrl: "https://app.example.test",
        timeZone: () => Promise.resolve("Asia/Kolkata"),
        names: () => Promise.resolve({ agencyName: "Sharma Holidays", agentName: null }),
        identity: {
          organizationsPage: ({ after }) =>
            Promise.resolve(
              after === undefined ? [{ id: world.organizationId, name: "x", code: "x", timeZone: "Asia/Kolkata" }] : [],
            ),
          membersHolding: () => Promise.resolve([]),
        },
        subscriptions: { entitlementsOf: () => Promise.resolve({ access: "full" } as never) },
        logger: { error: () => undefined } as never,
      },
      now,
    );
    expect(completed).toBeGreaterThanOrEqual(1);
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, over.bookingId))).status).toBe("completed");
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, still.bookingId))).status).toBe("confirmed");
    expect(
      (await world.inOrg((tx) => tx.bookingReminder.findFirstOrThrow({ where: { bookingId: over.bookingId } }))).status,
    ).toBe("skipped");
  });

  it("brings a claim left over a day back to due now and tells the managers once", async () => {
    const { quoteId, bookingId } = await aBooking(world, { confirmed: true });
    const early = new Date(now.getTime() - 2 * 86_400_000);
    const claimId = await world.inOrg((tx) =>
      submitPaymentClaim(
        tx,
        {
          organizationId: world.organizationId,
          quoteId,
          claim: { installmentId: null, amountPaise: 100_00, reference: "UTR1", screenshotAttachmentId: null },
        },
        early,
      ),
    );
    await world.inOrg((tx) => tx.paymentClaim.update({ where: { id: claimId }, data: { createdAt: early } }));
    // The owner snoozed the task for a day; it is later than now.
    await world.inOrg((tx) =>
      tx.task.updateMany({ where: { recordId: bookingId }, data: { dueAt: new Date(now.getTime() + 6 * 3_600_000) } }),
    );
    await world.inOrg((tx) => raiseStaleClaims(tx, world.organizationId, [world.manager.userId], now));
    await world.inOrg((tx) => raiseStaleClaims(tx, world.organizationId, [world.manager.userId], now));
    const claim = await world.inOrg((tx) => tx.paymentClaim.findUniqueOrThrow({ where: { id: claimId } }));
    const task = await world.inOrg((tx) => tx.task.findUniqueOrThrow({ where: { id: claim.taskId ?? "" } }));
    expect(task.dueAt.getTime()).toBeLessThanOrEqual(now.getTime());
    const notices = await world.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "booking.payment-waiting", recipientUserId: world.manager.userId } }),
    );
    expect(notices.filter((notice) => notice.body.includes("nobody has checked"))).toHaveLength(1);
  });

  describe("Today", () => {
    it("lists the person's own trips leaving within two weeks with details missing, and not far ones or others'", async () => {
      const soon = await aBooking(world, { startDate: day(6), confirmed: true, adults: 3 });
      await aBooking(world, { startDate: day(40), confirmed: true });
      const mine = await world.inOrg((tx) => bookingsMissingDetails(tx, world.seller.userId, day(0) as never));
      expect(mine.map((row) => row.bookingId)).toContain(soon.bookingId);
      expect(mine.find((row) => row.bookingId === soon.bookingId)).toMatchObject({ missing: 3, total: 3 });
      expect(mine.every((row) => row.startDate <= day(14))).toBe(true);
      const stranger = await world.inOrg((tx) => bookingsMissingDetails(tx, crypto.randomUUID(), day(0) as never));
      expect(stranger).toEqual([]);
      const summary = await world.inOrg((tx) => todaySummary(tx, world.seller, now));
      expect(summary.counts.tripDetails).toBeGreaterThan(0);
      const section = await world.inOrg((tx) =>
        todaySection(tx, world.seller, { section: "trip-details", limit: 20 }, now),
      );
      expect(
        section.items.find((item) => item.kind === "trip-details" && item.bookingId === soon.bookingId),
      ).toMatchObject({ missing: 3, total: 3 });
    });

    it("carries the booking beside a task about it, with the lead's name", async () => {
      const { bookingId } = await aBooking(world);
      const section = await world.inOrg((tx) =>
        todaySection(tx, world.seller, { section: "overdue", limit: 50 }, new Date(now.getTime() + 3_600_000)),
      );
      const item = section.items.find((one) => one.kind === "task" && one.booking?.id === bookingId);
      expect(item).toMatchObject({ kind: "task", booking: { id: bookingId } });
      expect(item?.kind === "task" ? item.lead?.personName : "").toBe("Rahul Sharma");
    });
  });

  it("empties a customer's travellers, ID numbers, claim references and feedback, and keeps the amounts", async () => {
    const { bookingId, quoteId, leadId } = await aBooking(world, { confirmed: true, adults: 1 });
    const person = await world.inOrg((tx) =>
      tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { personId: true } }),
    );
    const traveller = await world.inOrg((tx) => tx.bookingTraveller.findFirstOrThrow({ where: { bookingId } }));
    await world.inOrg(async (tx: OrgTx) => {
      await tx.bookingTraveller.update({
        where: { id: traveller.id },
        data: { name: "Asha Rao", phone: "+919800000009", medicalNotes: "Asthma" },
      });
      await tx.bookingTravellerIdentity.create({
        data: { travellerId: traveller.id, kind: "passport", number: "P1234567" },
      });
      await tx.paymentClaim.create({ data: { bookingId, amountPaise: 100_00n, reference: "UTR-SECRET" } });
      await tx.bookingFeedback.create({ data: { bookingId, overall: 5, comment: "Loved the driver Dorje" } });
    });
    await platformDb.transaction((tx) =>
      eraseCustomerParts(
        tx,
        systemActor(world.organizationId),
        { organizationId: world.organizationId, personId: person.personId },
        now,
      ),
    );
    const after = await world.inOrg(async (tx) => ({
      traveller: await tx.bookingTraveller.findUniqueOrThrow({ where: { id: traveller.id } }),
      identities: await tx.bookingTravellerIdentity.count({ where: { travellerId: traveller.id } }),
      claim: await tx.paymentClaim.findFirstOrThrow({ where: { bookingId } }),
      feedback: await tx.bookingFeedback.findFirstOrThrow({ where: { bookingId } }),
      booking: await tx.booking.findUnique({ where: { id: bookingId } }),
      quote: await tx.quote.findUniqueOrThrow({ where: { id: quoteId } }),
    }));
    expect(after.traveller).toMatchObject({ name: "", phone: "", medicalNotes: "", dateOfBirth: null });
    expect(after.identities).toBe(0);
    expect(after.claim).toMatchObject({ reference: "", amountPaise: 100_00n });
    expect(after.feedback).toMatchObject({ comment: "", overall: 5 });
    expect(after.booking).not.toBeNull();
    expect(Number(after.quote.totalPaise)).toBeGreaterThan(0);
  });

  it("confirms a booking once, whoever taps twice", async () => {
    const { bookingId } = await aBooking(world);
    await Promise.all([
      world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now)),
      world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now)),
    ]);
    expect((await world.inOrg((tx) => getBooking(tx, world.seller, bookingId))).installments).toHaveLength(2);
  });
});
