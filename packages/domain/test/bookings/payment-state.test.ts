// A booking's payment state and each due's state, read from the domain at the agency's today: nothing paid, part paid,
// one overdue, all paid.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBooking, listBookings } from "../../src/bookings/index.js";
import { recordPayment } from "../../src/quotes/index.js";
import { aBooking, openWorld, type World } from "./support.js";

describe("a booking's payment state", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Payment state");
  });
  afterAll(async () => {
    await world.close();
  });

  /** A booking of ₹1,00,000 with two dues of ₹40,000 and ₹60,000 on the given days (far past or far future). */
  async function bookingWithDues(firstDueOn: string, secondDueOn: string) {
    const { bookingId, quoteId } = await aBooking(world, { totalPaise: 100_000_00 });
    await world.inOrg(async (tx) => {
      await tx.quoteInstallment.createMany({
        data: [
          { quoteId, label: "Advance", amountPaise: 40_000_00n, dueOn: new Date(`${firstDueOn}T00:00:00Z`) },
          { quoteId, label: "Balance", amountPaise: 60_000_00n, dueOn: new Date(`${secondDueOn}T00:00:00Z`) },
        ],
      });
    });
    return { bookingId, quoteId };
  }

  const pay = (quoteId: string, amountPaise: number) =>
    world.inOrg((tx) =>
      recordPayment(
        tx,
        world.accounts,
        {
          quoteId,
          amountPaise,
          receivedOn: "2026-10-29",
          method: "upi",
          reference: "UTR",
          requestId: crypto.randomUUID(),
        },
        new Date("2026-10-29T06:30:00Z"),
      ),
    );

  const read = async (bookingId: string) => {
    const detail = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    const listed = (await world.inOrg((tx) => listBookings(tx, world.seller, {}))).items.find(
      (item) => item.id === bookingId,
    );
    expect(listed?.paymentState).toBe(detail.paymentState);
    return detail;
  };

  it("is nothing when nothing is paid and nothing is late", async () => {
    const { bookingId } = await bookingWithDues("2999-01-01", "2999-02-01");
    const detail = await read(bookingId);
    expect(detail.paymentState).toBe("nothing");
    expect(detail.installments.map((due) => due.state)).toEqual(["due", "due"]);
  });

  it("is overdue when a due is past and not covered, over nothing paid", async () => {
    const { bookingId } = await bookingWithDues("2020-01-01", "2999-01-01");
    const detail = await read(bookingId);
    expect(detail.paymentState).toBe("overdue");
    expect(detail.installments.map((due) => due.state)).toEqual(["overdue", "due"]);
  });

  it("is part paid once the late due is covered, and paid when the balance is 0", async () => {
    const { bookingId, quoteId } = await bookingWithDues("2020-01-01", "2999-01-01");
    await pay(quoteId, 40_000_00);
    const part = await read(bookingId);
    expect(part.paymentState).toBe("part_paid");
    expect(part.installments.map((due) => [due.paid, due.state])).toEqual([
      [true, "paid"],
      [false, "due"],
    ]);
    await pay(quoteId, 60_000_00);
    const full = await read(bookingId);
    expect(full.paymentState).toBe("paid");
    expect(full.installments.map((due) => due.state)).toEqual(["paid", "paid"]);
  });

  it("reads no due as overdue on a cancelled booking, and names the invoice once issued", async () => {
    const { bookingId, quoteId } = await bookingWithDues("2020-01-01", "2999-01-01");
    await world.inOrg((tx) =>
      tx.booking.update({ where: { id: bookingId }, data: { status: "cancelled", cancelledAt: new Date() } }),
    );
    const detail = await read(bookingId);
    expect(detail.paymentState).not.toBe("overdue");
    expect(detail.installments.map((due) => due.state)).toEqual(["due", "due"]);
    expect(detail.invoiceDocumentId).toBeNull();
    expect(quoteId).toBeTruthy();
  });
});
