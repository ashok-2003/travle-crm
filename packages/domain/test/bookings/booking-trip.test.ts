// The trip side of a booking (release 6, spec 2.4-2.9): travellers' own details and the cut-off, the stays with their vouchers
// and the itinerary PDF going out of date, cancellation with its charge and refund, feedback, and the reminders.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelBooking,
  confirmBooking,
  getBooking,
  issueVoucher,
  markRefunded,
  prepareTripPdf,
  previewCancellation,
  recordTripUpdatesConsentByStaff,
  requestFeedback,
  runBookingRemindersFor,
  saveEssentials,
  saveStay,
  saveTravellerByStaff,
  saveTravellerFromLink,
  setLevel,
  setRemindersPaused,
  setTravellerCount,
  submitFeedbackFromLink,
  travellerIdentityOf,
} from "../../src/bookings/index.js";
import { recordPayment } from "../../src/quotes/index.js";
import { aBooking, openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z"); // 12:00 on 29 Oct in India
const branding = { organizationName: "Sharma Holidays" };
const traveller = (travellerId: string, extra: Record<string, unknown> = {}) => ({
  travellerId,
  name: "Asha Rao",
  dateOfBirth: "1990-04-02",
  gender: "female" as const,
  phone: "",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  roomRequest: "none" as const,
  roomNote: "",
  identity: null,
  idPhotoAttachmentId: null,
  ...extra,
});

describe("travellers' own details", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Booking travellers");
  });
  afterAll(async () => {
    await world.close();
  });

  const confirmed = async (seed: Parameters<typeof aBooking>[1] = {}) => {
    const made = await aBooking(world, { confirmed: true, ...seed });
    const travellers = await world.inOrg((tx) =>
      tx.bookingTraveller.findMany({ where: { bookingId: made.bookingId }, orderBy: { position: "asc" } }),
    );
    return { ...made, travellers };
  };

  it("counts a traveller complete at the booking's level, and tells the timeline when the last one is", async () => {
    const { bookingId, quoteId, travellers } = await confirmed({ adults: 2 });
    const [first, second] = travellers;
    await world.inOrg((tx) =>
      saveTravellerFromLink(
        tx,
        { organizationId: world.organizationId, quoteId, traveller: traveller(first?.id ?? "") },
        now,
      ),
    );
    expect(await world.inOrg((tx) => getBooking(tx, world.seller, bookingId))).toMatchObject({
      travellersComplete: 1,
      travellersTotal: 2,
    });
    await world.inOrg((tx) =>
      saveTravellerFromLink(
        tx,
        { organizationId: world.organizationId, quoteId, traveller: traveller(second?.id ?? "", { name: "Ravi Rao" }) },
        now,
      ),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.seller, bookingId))).travellersComplete).toBe(2);
    const events = await world.inOrg((tx) =>
      tx.leadTimelineEntry.findMany({ where: { recordId: bookingId, bookingEvent: "details-complete" } }),
    );
    expect(events).toHaveLength(1);
  });

  it("asks for an emergency contact at Detailed and a passport at International", async () => {
    const { bookingId, quoteId, travellers } = await confirmed({ adults: 1 });
    const id = travellers[0]?.id ?? "";
    await world.inOrg((tx) =>
      saveTravellerFromLink(tx, { organizationId: world.organizationId, quoteId, traveller: traveller(id) }, now),
    );
    await world.inOrg((tx) => setLevel(tx, world.manager, { bookingId, level: "detailed" }, now));
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellersComplete).toBe(0);
    await world.inOrg((tx) =>
      saveTravellerFromLink(
        tx,
        {
          organizationId: world.organizationId,
          quoteId,
          traveller: traveller(id, { emergencyName: "Meera", emergencyPhone: "+919800000001" }),
        },
        now,
      ),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellersComplete).toBe(1);
    await world.inOrg((tx) => setLevel(tx, world.manager, { bookingId, level: "international" }, now));
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellersComplete).toBe(0);
    await world.inOrg((tx) =>
      saveTravellerFromLink(
        tx,
        {
          organizationId: world.organizationId,
          quoteId,
          traveller: traveller(id, {
            emergencyName: "Meera",
            emergencyPhone: "+919800000001",
            identity: {
              kind: "passport",
              number: "P1234567",
              issuedOn: "2020-01-01",
              expiresOn: "2030-01-01",
              nationality: "Indian",
            },
          }),
        },
        now,
      ),
    );
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail.travellersComplete).toBe(1);
    // Never the number back in the booking, and it is read only with documents:view_sensitive, audited.
    expect(JSON.stringify(detail)).not.toContain("P1234567");
    await expect(world.inOrg((tx) => travellerIdentityOf(tx, world.seller, id))).rejects.toMatchObject({
      reason: "MISSING_PERMISSION",
    });
    const identity = await world.inOrg((tx) => travellerIdentityOf(tx, world.manager, id));
    expect(identity).toMatchObject({ kind: "passport", number: "P1234567" });
    expect(
      await world.inOrg((tx) => tx.auditEntry.count({ where: { action: "booking.identity-viewed" } })),
    ).toBeGreaterThan(0);
  });

  it("locks at the cut-off for the traveller, not for staff", async () => {
    const { bookingId, quoteId, travellers } = await confirmed({ startDate: "2026-11-01" });
    const id = travellers[0]?.id ?? "";
    // Cut-off is 3 days before 1 Nov: 29 Oct is the last day.
    await world.inOrg((tx) =>
      saveTravellerFromLink(tx, { organizationId: world.organizationId, quoteId, traveller: traveller(id) }, now),
    );
    const lateIn = new Date("2026-10-30T06:30:00Z");
    await expect(
      world.inOrg((tx) =>
        saveTravellerFromLink(
          tx,
          { organizationId: world.organizationId, quoteId, traveller: traveller(id, { name: "Changed" }) },
          lateIn,
        ),
      ),
    ).rejects.toMatchObject({ reason: "DETAILS_LOCKED" });
    await world.inOrg((tx) =>
      saveTravellerByStaff(tx, world.manager, { ...traveller(id, { name: "Fixed by staff" }), identity: null }, lateIn),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellers[0]?.name).toBe(
      "Fixed by staff",
    );
  });

  it("adds empty rows or removes the last ones when the headcount changes", async () => {
    const { bookingId } = await confirmed({ adults: 2 });
    await world.inOrg((tx) => setTravellerCount(tx, world.manager, { bookingId, count: 4 }));
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellersTotal).toBe(4);
    await world.inOrg((tx) => setTravellerCount(tx, world.manager, { bookingId, count: 1 }));
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).travellersTotal).toBe(1);
  });
});

describe("stays, vouchers and the itinerary PDF", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Booking vouchers");
  });
  afterAll(async () => {
    await world.close();
  });

  it("issues a voucher once for a stay, again after the stay changes, and lists the stale one as out of date", async () => {
    const { bookingId } = await aBooking(world, { confirmed: true });
    const { stayId } = await world.inOrg((tx) =>
      saveStay(tx, world.manager, {
        bookingId,
        name: "Hotel Snow Lion",
        address: "Kaza",
        mapUrl: "",
        checkIn: "2026-12-20",
        checkOut: "2026-12-22",
        notes: "Double room, breakfast",
      }),
    );
    const first = await world.inOrg((tx) => issueVoucher(tx, world.manager, stayId, branding, now));
    expect(first.number).toMatch(/^VCH-2026-\d{4}$/);
    const same = await world.inOrg((tx) => issueVoucher(tx, world.manager, stayId, branding, now));
    expect(same.documentId).toBe(first.documentId);
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).stays[0]?.voucher).toMatchObject({
      number: first.number,
      upToDate: true,
    });
    await world.inOrg((tx) =>
      saveStay(tx, world.manager, {
        bookingId,
        stayId,
        name: "Hotel Snow Lion",
        address: "Kaza",
        mapUrl: "",
        checkIn: "2026-12-20",
        checkOut: "2026-12-23",
        notes: "Double room, breakfast",
      }),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).stays[0]?.voucher?.upToDate).toBe(
      false,
    );
    const second = await world.inOrg((tx) => issueVoucher(tx, world.manager, stayId, branding, now));
    expect(second.documentId).not.toBe(first.documentId);
    // The old one stays in the documents list.
    expect(await world.inOrg((tx) => tx.issuedDocument.count({ where: { id: first.documentId } }))).toBe(1);
  });

  it("goes out of date on a change to the plan or the essentials, and is issued again only when asked", async () => {
    const { bookingId } = await aBooking(world, { confirmed: true });
    const first = await world.inOrg((tx) => prepareTripPdf(tx, world.manager, bookingId, branding, now));
    expect(first.number).toMatch(/^ITN-2026-\d{4}$/);
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).tripPdf).toMatchObject({
      upToDate: true,
    });
    await world.inOrg((tx) =>
      saveEssentials(
        tx,
        world.manager,
        {
          bookingId,
          reportingTime: "06:30",
          reportingPlace: "Hotel lobby, Manali",
          driverName: "Dorje",
          driverPhone: "+919800000002",
          emergencyName: "Office",
          emergencyPhone: "+919800000003",
        },
        now,
      ),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).tripPdf?.upToDate).toBe(false);
    const again = await world.inOrg((tx) => prepareTripPdf(tx, world.manager, bookingId, branding, now));
    expect(again.documentId).not.toBe(first.documentId);
  });

  it("refuses a voucher before the booking is confirmed", async () => {
    const { bookingId } = await aBooking(world);
    const { stayId } = await world.inOrg((tx) =>
      saveStay(tx, world.manager, {
        bookingId,
        name: "Hotel",
        address: "",
        mapUrl: "",
        checkIn: "2026-12-20",
        checkOut: "2026-12-21",
        notes: "",
      }),
    );
    await expect(world.inOrg((tx) => issueVoucher(tx, world.manager, stayId, branding, now))).rejects.toMatchObject({
      reason: "BOOKING_NOT_CONFIRMED",
    });
  });
});

describe("cancelling and the refund", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Booking cancellation");
  });
  afterAll(async () => {
    await world.close();
  });

  const paidBooking = async (paid: number, seed: Parameters<typeof aBooking>[1] = {}) => {
    const made = await aBooking(world, { confirmed: true, totalPaise: 100_000_00, startDate: "2026-12-10", ...seed });
    if (paid > 0) {
      await world.inOrg((tx) =>
        recordPayment(
          tx,
          world.accounts,
          {
            quoteId: made.quoteId,
            amountPaise: paid,
            receivedOn: "2026-10-29",
            method: "bank",
            reference: "",
            requestId: crypto.randomUUID(),
          },
          now,
        ),
      );
    }
    return made;
  };

  it("works out the charge from the policy frozen at booking and the refund from what was paid", async () => {
    const { bookingId } = await paidBooking(30_000_00);
    expect(await world.inOrg((tx) => previewCancellation(tx, world.manager, bookingId, now))).toMatchObject({
      daysBefore: 42,
      chargeBasisPoints: 1_000,
      chargePaise: 10_000_00,
      paidPaise: 30_000_00,
      refundPaise: 20_000_00,
    });
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Family emergency" }, now));
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail).toMatchObject({
      status: "cancelled",
      refundDuePaise: 20_000_00,
      cancellation: { chargePaise: 10_000_00, reason: "Family emergency" },
    });
    expect(detail.totalPaise).toBe(10_000_00);
    const task = await world.inOrg((tx) =>
      tx.task.findFirstOrThrow({
        where: { recordType: "booking", recordId: bookingId, title: { startsWith: "Refund" }, doneAt: null },
      }),
    );
    expect(task.assigneeUserId).toBe(world.seller.userId);
    // The payment stays a payment: nothing negative.
    expect(await world.inOrg((tx) => tx.quotePayment.count({ where: { amountPaise: { lt: 0 } } }))).toBe(0);
  });

  it("ends the booking's unsent reminders and open Confirm task", async () => {
    const { bookingId } = await aBooking(world, { totalPaise: 50_000_00 });
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Changed plans" }, now));
    const task = await world.inOrg((tx) =>
      tx.task.findFirstOrThrow({ where: { recordType: "booking", recordId: bookingId } }),
    );
    expect(task.cancelledAt).not.toBeNull();
    expect(await world.inOrg((tx) => tx.paymentClaim.count({ where: { bookingId } }))).toBe(0);
  });

  it("changes the charge only with a reason, and audits before, after and why", async () => {
    const { bookingId } = await paidBooking(30_000_00);
    await world.inOrg((tx) =>
      cancelBooking(
        tx,
        world.manager,
        { bookingId, reason: "Goodwill", chargePaise: 2_000_00, chargeOverrideReason: "Long-time customer" },
        now,
      ),
    );
    const entries = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: bookingId, action: "booking.charge-changed" } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      before: { chargePaise: 10_000_00 },
      after: { chargePaise: 2_000_00, reason: "Long-time customer" },
    });
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).refundDuePaise).toBe(28_000_00);
  });

  it("keeps what was paid beyond nothing: no refund when the charge is the whole total", async () => {
    const { bookingId } = await paidBooking(30_000_00, { startDate: "2026-11-03" });
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Late" }, now));
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail).toMatchObject({ refundDuePaise: 0, refund: null, cancellation: { chargePaise: 100_000_00 } });
  });

  it("marks a refund paid with the day, how and the reference, once", async () => {
    const { bookingId } = await paidBooking(30_000_00);
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "x" }, now));
    await world.inOrg((tx) =>
      markRefunded(
        tx,
        world.accounts,
        { bookingId, refundedOn: "2026-11-02", method: "bank", reference: "NEFT88" },
        now,
      ),
    );
    await world.inOrg((tx) =>
      markRefunded(tx, world.accounts, { bookingId, refundedOn: "2026-11-03", method: "upi", reference: "other" }, now),
    );
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail.refund).toMatchObject({
      status: "refunded",
      refundedOn: "2026-11-02",
      method: "bank",
      reference: "NEFT88",
    });
    expect(detail.refundDuePaise).toBe(0);
  });

  it("cancels a booking only once", async () => {
    const { bookingId } = await paidBooking(0);
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "x" }, now));
    await expect(
      world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "x" }, now)),
    ).rejects.toMatchObject({ reason: "BOOKING_NOT_CANCELLABLE" });
  });
});

describe("feedback", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Booking feedback");
  });
  afterAll(async () => {
    await world.close();
  });

  const dependencies = {
    appUrl: "https://app.example.test",
    names: () => Promise.resolve({ agencyName: "Sharma Holidays", agentName: "Priya" }),
  };
  const feedback = (overall: number) => ({
    overall,
    hotel: 4,
    transport: null,
    guide: null,
    comment: "Lovely",
    mayShare: false,
    photoAttachmentIds: [],
  });

  it("is asked for once, then the traveller sends it once; low stars tell the owner and the managers now", async () => {
    const { bookingId, quoteId } = await aBooking(world, { confirmed: true });
    await expect(
      world.inOrg((tx) =>
        submitFeedbackFromLink(tx, {
          organizationId: world.organizationId,
          quoteId,
          feedback: feedback(2),
          managers: [world.manager.userId],
        }),
      ),
    ).rejects.toMatchObject({ reason: "FEEDBACK_NOT_ASKED" });
    await world.inOrg((tx) => requestFeedback(tx, world.manager, { bookingId }, dependencies, now));
    await expect(
      world.inOrg((tx) => requestFeedback(tx, world.manager, { bookingId }, dependencies, now)),
    ).rejects.toMatchObject({ reason: "FEEDBACK_ALREADY_REQUESTED" });
    await world.inOrg((tx) =>
      submitFeedbackFromLink(tx, {
        organizationId: world.organizationId,
        quoteId,
        feedback: feedback(2),
        managers: [world.manager.userId],
      }),
    );
    await expect(
      world.inOrg((tx) =>
        submitFeedbackFromLink(tx, {
          organizationId: world.organizationId,
          quoteId,
          feedback: feedback(5),
          managers: [],
        }),
      ),
    ).rejects.toMatchObject({ reason: "FEEDBACK_ALREADY_SENT" });
    const notices = await world.inOrg((tx) => tx.notification.findMany({ where: { kind: "booking.low-feedback" } }));
    expect(notices.map((notice) => notice.recipientUserId).sort()).toEqual(
      [world.manager.userId, world.seller.userId].sort(),
    );
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).feedback).toMatchObject({
      overall: 2,
      comment: "Lovely",
    });
  });

  it("does not alert for four stars", async () => {
    const { bookingId, quoteId } = await aBooking(world, { confirmed: true });
    await world.inOrg((tx) => requestFeedback(tx, world.manager, { bookingId }, dependencies, now));
    const before = await world.inOrg((tx) => tx.notification.count({ where: { kind: "booking.low-feedback" } }));
    await world.inOrg((tx) =>
      submitFeedbackFromLink(tx, {
        organizationId: world.organizationId,
        quoteId,
        feedback: feedback(4),
        managers: [world.manager.userId],
      }),
    );
    expect(await world.inOrg((tx) => tx.notification.count({ where: { kind: "booking.low-feedback" } }))).toBe(before);
  });
});

describe("reminders", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Booking reminders");
  });
  afterAll(async () => {
    await world.close();
  });

  const dependencies = () => ({
    db: world.db,
    appUrl: "https://app.example.test",
    timeZone: () => Promise.resolve("Asia/Kolkata"),
    names: () => Promise.resolve({ agencyName: "Sharma Holidays", agentName: "Priya" }),
  });

  it("becomes a task to remind by hand when the traveller never agreed to trip updates", async () => {
    // Departing 8 Nov, so the details reminder (10 days before) came due this morning.
    const { bookingId } = await aBooking(world, { startDate: "2026-11-08" });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    expect(await runBookingRemindersFor(dependencies(), world.organizationId, now)).toBe(0);
    const rows = await world.inOrg((tx) => tx.bookingReminder.findMany({ where: { bookingId, status: "by_hand" } }));
    expect(rows.map((row) => [row.kind, row.note])).toContainEqual(["details", "no_consent"]);
    const task = await world.inOrg((tx) => tx.task.findFirstOrThrow({ where: { id: rows[0]?.taskId ?? "" } }));
    expect(task).toMatchObject({ assigneeUserId: world.seller.userId, recordType: "booking", recordId: bookingId });
    // Run again: nothing more.
    await runBookingRemindersFor(dependencies(), world.organizationId, now);
    expect(await world.inOrg((tx) => tx.bookingReminder.count({ where: { bookingId, status: "by_hand" } }))).toBe(
      rows.length,
    );
  });

  it("is skipped when there is nothing to ask for any more", async () => {
    const { bookingId } = await aBooking(world, { startDate: "2026-11-08", adults: 0, children: 0 });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    await runBookingRemindersFor(dependencies(), world.organizationId, now);
    const rows = await world.inOrg((tx) => tx.bookingReminder.findMany({ where: { bookingId, kind: "details" } }));
    expect(rows[0]).toMatchObject({ status: "skipped", note: "complete" });
  });

  it("waits while the booking's reminders are paused, and outside working hours", async () => {
    const { bookingId } = await aBooking(world, { startDate: "2026-11-08" });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    await world.inOrg((tx) => setRemindersPaused(tx, world.seller, { bookingId, paused: true }, now));
    await runBookingRemindersFor(dependencies(), world.organizationId, now);
    expect(
      await world.inOrg((tx) =>
        tx.bookingReminder.count({ where: { bookingId, status: "scheduled", kind: "details" } }),
      ),
    ).toBe(1);
    await world.inOrg((tx) => setRemindersPaused(tx, world.seller, { bookingId, paused: false }, now));
    const night = new Date("2026-10-29T20:30:00Z"); // 02:00 the next day in India
    await runBookingRemindersFor(dependencies(), world.organizationId, night);
    expect(
      await world.inOrg((tx) =>
        tx.bookingReminder.count({ where: { bookingId, status: "scheduled", kind: "details" } }),
      ),
    ).toBe(1);
  });

  it("records the traveller's agreement to trip updates once, when staff made the booking", async () => {
    const { bookingId } = await aBooking(world, { confirmed: true });
    await world.inOrg((tx) => recordTripUpdatesConsentByStaff(tx, world.manager, { bookingId }, now));
    await world.inOrg((tx) => recordTripUpdatesConsentByStaff(tx, world.manager, { bookingId }, now));
    expect((await world.inOrg((tx) => getBooking(tx, world.manager, bookingId))).tripUpdatesAgreed).toBe(true);
    const lead = await world.inOrg((tx) =>
      tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { lead: { select: { personId: true } } } }),
    );
    expect(
      await world.inOrg((tx) =>
        tx.personConsent.count({ where: { personId: lead.lead.personId, purpose: "trip_updates" } }),
      ),
    ).toBe(1);
  });
});
