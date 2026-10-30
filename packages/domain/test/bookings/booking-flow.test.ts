// A booking from an accepted quote to a confirmed one and its money (release 6, spec 2.1, 2.2): made once from the quote,
// numbered, with a row for each traveller and a "Confirm booking" task; confirmed in one tap with the agency's schedule; a
// traveller's "I've paid" checked by staff, recorded once, or rejected.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  confirmBooking,
  confirmClaim,
  createBookingFromQuote,
  getBooking,
  listBookings,
  rejectClaim,
  saveSchedule,
  submitPaymentClaim,
} from "../../src/bookings/index.js";
import { recordPayment, voidPayment } from "../../src/quotes/index.js";
import { aBooking, aQuote, openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z");

describe("a booking from an accepted quote", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Bookings flow");
  });
  afterAll(async () => {
    await world.close();
  });

  it("is made once from the quote, numbered, with a traveller row each and a task for the lead's owner", async () => {
    const { bookingId, quoteId } = await aBooking(world, { adults: 2, children: 1 });
    const again = await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId, confirmed: false }, now),
    );
    expect(again).toBe(bookingId);
    const booking = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(booking).toMatchObject({ status: "requested", travellersTotal: 3, travellersComplete: 0, level: "basic" });
    expect(booking.number).toMatch(/^BK-2026-\d{4}$/);
    expect(booking.endDate).toBe("2026-12-22");
    const tasks = await world.inOrg((tx) =>
      tx.task.findMany({ where: { recordType: "booking", recordId: bookingId } }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeUserId: world.seller.userId });
    const notices = await world.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "booking.requested", recipientUserId: world.seller.userId } }),
    );
    expect(notices.length).toBeGreaterThan(0);
  });

  it("numbers bookings in order, a year at a time", async () => {
    const first = await aBooking(world);
    const second = await aBooking(world);
    const numbers = await world.inOrg(async (tx) =>
      (
        await tx.booking.findMany({
          where: { id: { in: [first.bookingId, second.bookingId] } },
          orderBy: { id: "asc" },
        })
      ).map((row) => row.number),
    );
    const [one = "", two = ""] = numbers.map((number) => Number(number.slice(-4)));
    expect(Number(two) - Number(one)).toBe(1);
  });

  it("is Confirmed already when staff recorded money on the quote, and reverts with the quote when that payment is voided", async () => {
    const { quote } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId, status: "sent" }));
    await world.inOrg((tx) =>
      recordPayment(
        tx,
        world.accounts,
        {
          quoteId: quote.id,
          amountPaise: 10_000_00,
          receivedOn: "2026-10-29",
          method: "upi",
          reference: "UTR1",
          requestId: crypto.randomUUID(),
        },
        now,
      ),
    );
    const events = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "quote.accepted" } }));
    expect(events.map((event) => event.payload)).toContainEqual({
      quoteId: quote.id,
      leadId: quote.leadId,
      confirmed: true,
    });
    const bookingId = await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId: quote.id, confirmed: true }, now),
    );
    expect((await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId ?? "" } }))).status).toBe(
      "confirmed",
    );
    const payment = await world.inOrg((tx) => tx.quotePayment.findFirstOrThrow({ where: { quoteId: quote.id } }));
    await world.inOrg((tx) => voidPayment(tx, world.accounts, payment.id, now));
    const reverted = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "quote.reverted" } }));
    expect(reverted.map((event) => event.payload)).toContainEqual({ quoteId: quote.id });
  });

  it("is confirmed in one tap with the agency's default schedule, finishing the task", async () => {
    const { bookingId, quoteId } = await aBooking(world, { totalPaise: 100_000_00 });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    const dues = await world.inOrg((tx) =>
      tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } }),
    );
    expect(dues.map((due) => [due.label, Number(due.amountPaise), due.dueOn.toISOString().slice(0, 10)])).toEqual([
      ["Advance", 30_000_00, "2026-10-29"],
      ["Balance", 70_000_00, "2026-12-05"],
    ]);
    const task = await world.inOrg((tx) =>
      tx.task.findFirstOrThrow({ where: { recordType: "booking", recordId: bookingId } }),
    );
    expect(task.doneAt).not.toBeNull();
    const reminders = await world.inOrg((tx) => tx.bookingReminder.findMany({ where: { bookingId } }));
    // The advance's day (today) and the balance's two days; the advance's earlier reminder is past and is not made.
    expect(reminders.map((row) => row.kind).sort()).toEqual(["balance", "balance", "balance", "details", "reporting"]);
    // A second tap changes nothing.
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    expect(await world.inOrg((tx) => tx.quoteInstallment.count({ where: { quoteId } }))).toBe(2);
  });

  it("refuses a schedule that does not add up to the quote's total", async () => {
    const { bookingId } = await aBooking(world, { totalPaise: 100_000_00 });
    await expect(
      world.inOrg((tx) =>
        confirmBooking(
          tx,
          world.seller,
          { bookingId, installments: [{ label: "All", amountPaise: 99_000_00, dueOn: "2026-11-05" }] },
          now,
        ),
      ),
    ).rejects.toMatchObject({ reason: "INSTALLMENTS_MISMATCH" });
  });

  it("changes the payments due later, keeping the ones claimed on", async () => {
    const { bookingId, quoteId } = await aBooking(world, { totalPaise: 100_000_00 });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    const [advance, balance] = await world.inOrg((tx) =>
      tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } }),
    );
    await world.inOrg((tx) =>
      saveSchedule(
        tx,
        world.seller,
        {
          bookingId,
          installments: [
            { id: advance?.id ?? "", label: "Advance", amountPaise: 40_000_00, dueOn: "2026-10-30" },
            { id: balance?.id ?? "", label: "Balance", amountPaise: 60_000_00, dueOn: "2026-12-01" },
          ],
        },
        now,
      ),
    );
    const after = await world.inOrg((tx) =>
      tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } }),
    );
    expect(after.map((due) => Number(due.amountPaise))).toEqual([40_000_00, 60_000_00]);
  });
});

describe("I've paid", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Bookings claims");
  });
  afterAll(async () => {
    await world.close();
  });

  const claimOn = async (quoteId: string, amountPaise = 30_000_00) =>
    world.inOrg((tx) =>
      submitPaymentClaim(
        tx,
        {
          organizationId: world.organizationId,
          quoteId,
          claim: { installmentId: null, amountPaise, reference: "UTR998877", screenshotAttachmentId: null },
        },
        now,
      ),
    );

  it("makes a pending claim, a Check payment task and a notice for the lead's owner", async () => {
    const { bookingId, quoteId } = await aBooking(world, { confirmed: true });
    const claimId = await claimOn(quoteId);
    const detail = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(detail.claims).toMatchObject([{ id: claimId, status: "pending", amountPaise: 30_000_00 }]);
    expect(detail.pendingClaims).toBe(1);
    const tasks = await world.inOrg((tx) =>
      tx.task.findMany({ where: { recordType: "booking", recordId: bookingId, doneAt: null, cancelledAt: null } }),
    );
    expect(tasks.map((task) => task.title)).toEqual([expect.stringContaining("Check payment of")]);
    const notices = await world.inOrg((tx) => tx.notification.findMany({ where: { kind: "booking.payment-claimed" } }));
    expect(notices.some((notice) => notice.recipientUserId === world.seller.userId)).toBe(true);
  });

  it("is confirmed into one payment on the quote, even when confirmed twice, and finishes the task", async () => {
    const { bookingId, quoteId } = await aBooking(world, { confirmed: true });
    const claimId = await claimOn(quoteId, 25_000_00);
    await world.inOrg((tx) => confirmClaim(tx, world.accounts, { claimId }, now));
    await world.inOrg((tx) => confirmClaim(tx, world.accounts, { claimId }, now));
    const payments = await world.inOrg((tx) => tx.quotePayment.findMany({ where: { quoteId } }));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ method: "upi", reference: "UTR998877", requestId: claimId });
    expect(Number(payments[0]?.amountPaise)).toBe(25_000_00);
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail.claims[0]?.status).toBe("confirmed");
    expect(detail.paidPaise).toBe(25_000_00);
    const open = await world.inOrg((tx) =>
      tx.task.count({ where: { recordType: "booking", recordId: bookingId, doneAt: null, cancelledAt: null } }),
    );
    expect(open).toBe(0);
  });

  it("is confirmed for the amount actually received when that differs", async () => {
    const { quoteId } = await aBooking(world, { confirmed: true });
    const claimId = await claimOn(quoteId, 30_000_00);
    await world.inOrg((tx) => confirmClaim(tx, world.accounts, { claimId, amountPaise: 29_000_00 }, now));
    const payment = await world.inOrg((tx) => tx.quotePayment.findFirstOrThrow({ where: { quoteId } }));
    expect(Number(payment.amountPaise)).toBe(29_000_00);
  });

  it("is rejected with a reason and may be claimed again", async () => {
    const { bookingId, quoteId } = await aBooking(world, { confirmed: true });
    const claimId = await claimOn(quoteId);
    await world.inOrg((tx) => rejectClaim(tx, world.accounts, { claimId, reason: "not_found" }, now));
    await expect(world.inOrg((tx) => confirmClaim(tx, world.accounts, { claimId }, now))).rejects.toMatchObject({
      reason: "CLAIM_DECIDED",
    });
    expect(await world.inOrg((tx) => tx.quotePayment.count({ where: { quoteId } }))).toBe(0);
    await claimOn(quoteId);
    const detail = await world.inOrg((tx) => getBooking(tx, world.manager, bookingId));
    expect(detail.claims.map((claim) => claim.status)).toEqual(["pending", "rejected"]);
  });

  it("refuses a claim bigger than what is left, one without proof, and too many waiting at once", async () => {
    const { quoteId } = await aBooking(world, { confirmed: true, totalPaise: 10_000_00 });
    await expect(claimOn(quoteId, 10_001_00)).rejects.toMatchObject({ reason: "CLAIM_EXCEEDS_BALANCE" });
    await expect(
      world.inOrg((tx) =>
        submitPaymentClaim(
          tx,
          {
            organizationId: world.organizationId,
            quoteId,
            claim: { installmentId: null, amountPaise: 100_00, reference: "", screenshotAttachmentId: null },
          },
          now,
        ),
      ),
    ).rejects.toMatchObject({ reason: "CLAIM_NEEDS_PROOF" });
    for (let index = 0; index < 5; index += 1) await claimOn(quoteId, 100_00);
    await expect(claimOn(quoteId, 100_00)).rejects.toMatchObject({ reason: "TOO_MANY_CLAIMS" });
  });

  it("is listed with its booking's progress, a page at a time, within the member's scope", async () => {
    const { bookingId } = await aBooking(world, { confirmed: true });
    const mine = await world.inOrg((tx) => listBookings(tx, world.seller, { claimsPending: false }));
    expect(mine.items.map((item) => item.id)).toContain(bookingId);
    const stranger = { ...world.seller, userId: crypto.randomUUID() };
    expect((await world.inOrg((tx) => listBookings(tx, stranger, {}))).items).toEqual([]);
  });
});
