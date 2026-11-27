// The Bookings table's page (bookings revamp, 2026-11-27): searched by the customer's name, phone digits, the trip's title
// and the booking's number; filtered by status, a payment to check, travel dates, salesperson and payment state (the
// domain's own rule); sorted by travel date (soonest first, no date last, then the id) or any column either way; counted
// across its pages; and held to the member's own bookings, total and all, for a salesperson.
import type { BookingTablePageInput } from "@travel-crm/contracts/bookings";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookingTablePageOf, cancelBooking } from "../../src/bookings/index.js";
import { recordPayment } from "../../src/quotes/index.js";
import { aBooking, openWorld, type QuoteSeed, type World } from "./support.js";
import type { MemberAccess } from "../../src/identity/index.js";

// 11:00 am on Thursday 29 October 2026 in India.
const NOW = new Date("2026-10-29T05:30:00Z");

let world: World;
beforeEach(async () => {
  world = await openWorld("Bookings table");
});
afterEach(async () => {
  await world.close();
});

interface Seed extends Partial<QuoteSeed> {
  name?: string;
  phone?: string;
  title?: string;
  confirmed?: boolean;
}

/** A booking for this customer and trip, the seller's unless another owns its lead. */
async function aTableBooking(seed: Seed = {}) {
  const made = await aBooking(world, seed);
  await world.inOrg(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: made.leadId }, select: { personId: true } });
    await tx.person.update({
      where: { id: lead.personId },
      data: { name: seed.name ?? "Rahul Sharma", ...(seed.phone === undefined ? {} : { phoneE164: seed.phone }) },
    });
    if (seed.title !== undefined) await tx.quote.update({ where: { id: made.quoteId }, data: { title: seed.title } });
  });
  const { number } = await world.inOrg((tx) =>
    tx.booking.findUniqueOrThrow({ where: { id: made.bookingId }, select: { number: true } }),
  );
  return { ...made, number };
}

const page = (access: MemberAccess, input: Partial<BookingTablePageInput> = {}) =>
  world.inOrg((tx) =>
    bookingTablePageOf(tx, access, { page: 1, limit: 25, sort: "travel", direction: "asc", ...input }, NOW),
  );

const names = async (access: MemberAccess, input: Partial<BookingTablePageInput> = {}) =>
  (await page(access, input)).items.map((item) => item.customerName);

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
      NOW,
    ),
  );

/** Two payments due of ₹40,000 and ₹60,000 on a ₹1,00,000 trip. */
const dues = (quoteId: string, first: string, second: string) =>
  world.inOrg((tx) =>
    tx.quoteInstallment.createMany({
      data: [
        { quoteId, label: "Advance", amountPaise: 40_000_00n, dueOn: new Date(`${first}T00:00:00Z`) },
        { quoteId, label: "Balance", amountPaise: 60_000_00n, dueOn: new Date(`${second}T00:00:00Z`) },
      ],
    }),
  );

describe("the bookings table's page", () => {
  it("searches the customer's name, a phone's digits, the trip's title and the booking's number", async () => {
    await aTableBooking({ name: "Meera Iyer", phone: "+919876500002", title: "Kerala backwaters" });
    const dev = await aTableBooking({ name: "Dev Patel", phone: "+919811122233", title: "Rajasthan forts" });
    await aTableBooking({ name: "Rahul Sharma", phone: "+919800000001", title: "Spiti 6 days" });
    const { seller } = world;
    expect(await names(seller, { search: "meera" })).toEqual(["Meera Iyer"]);
    expect(await names(seller, { search: "98111 22233" })).toEqual(["Dev Patel"]);
    expect(await names(seller, { search: "098111-22233" })).toEqual(["Dev Patel"]);
    // Fewer than four digits look in no phone (as Leads): "98" is in every Indian mobile.
    expect(await names(seller, { search: "98" })).toEqual([]);
    expect(await names(seller, { search: "981" })).toEqual([]);
    expect(await names(seller, { search: "KERALA" })).toEqual(["Meera Iyer"]);
    expect(await names(seller, { search: dev.number.toLowerCase() })).toEqual(["Dev Patel"]);
    // A number's last digits find the number, not every phone with a 2 in it.
    expect(await names(seller, { search: dev.number.slice(-4) })).toEqual(["Dev Patel"]);
    // LIKE's wildcards are letters; a blank is no search.
    expect(await names(seller, { search: "%" })).toEqual([]);
    expect(await names(seller, { search: "Dev_Patel" })).toEqual([]);
    expect(await names(seller, { search: "" })).toHaveLength(3);
  });

  it("filters by status, a payment to check, travel dates and salesperson", async () => {
    const december = await aTableBooking({ name: "December", startDate: "2026-12-20" });
    await aTableBooking({ name: "January", startDate: "2027-01-10", confirmed: true });
    await aTableBooking({ name: "No date", startDate: null });
    await aTableBooking({ name: "Manager's", startDate: "2026-12-24", ownerUserId: world.manager.userId });
    await world.inOrg((tx) =>
      tx.paymentClaim.create({ data: { bookingId: december.bookingId, amountPaise: 30_000_00n, reference: "UTR1" } }),
    );
    const { manager } = world;
    expect(await names(manager, { status: "confirmed" })).toEqual(["January"]);
    expect(await names(manager, { claimsPending: true })).toEqual(["December"]);
    expect(await names(manager, { travelFrom: "2026-12-01", travelTo: "2026-12-31" })).toEqual([
      "December",
      "Manager's",
    ]);
    expect(await names(manager, { travelFrom: "2026-12-24" })).toEqual(["Manager's", "January"]);
    expect(await names(manager, { travelTo: "2026-12-20" })).toEqual(["December"]);
    expect(await names(manager, { ownerUserId: world.manager.userId })).toEqual(["Manager's"]);
    expect(await names(manager, { ownerUserId: world.seller.userId })).toEqual(["December", "January", "No date"]);
  });

  it("filters by payment state with the domain's rule: due today is not overdue, a claim is not paid", async () => {
    const nothing = await aTableBooking({ name: "Nothing" });
    await dues(nothing.quoteId, "2026-10-29", "2026-12-01");
    const overdue = await aTableBooking({ name: "Overdue" });
    await dues(overdue.quoteId, "2026-10-28", "2026-12-01");
    const part = await aTableBooking({ name: "Part paid" });
    await dues(part.quoteId, "2026-10-01", "2026-12-01");
    await pay(part.quoteId, 40_000_00);
    const paid = await aTableBooking({ name: "Paid" });
    await pay(paid.quoteId, 100_000_00);
    const claimed = await aTableBooking({ name: "Claimed" });
    await world.inOrg((tx) =>
      tx.paymentClaim.create({ data: { bookingId: claimed.bookingId, amountPaise: 100_000_00n, reference: "UTR2" } }),
    );
    // Cancelled with a due late and its charge not all paid: it owes its charge, and is never overdue.
    const cancelled = await aTableBooking({ name: "Cancelled", confirmed: true });
    await dues(cancelled.quoteId, "2026-10-01", "2026-12-01");
    await pay(cancelled.quoteId, 10_000_00);
    await world.inOrg((tx) =>
      cancelBooking(
        tx,
        world.manager,
        {
          bookingId: cancelled.bookingId,
          reason: "Plans changed",
          chargePaise: 50_000_00,
          chargeOverrideReason: "Hotel",
        },
        NOW,
      ),
    );
    const { seller } = world;
    expect(await names(seller, { payment: "nothing" })).toEqual(["Nothing", "Claimed"]);
    expect(await names(seller, { payment: "overdue" })).toEqual(["Overdue"]);
    expect(await names(seller, { payment: "part_paid" })).toEqual(["Part paid", "Cancelled"]);
    expect(await names(seller, { payment: "paid" })).toEqual(["Paid"]);
    const listed = await page(seller, { payment: "overdue" });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.paymentState).toBe("overdue");
  });

  it("sorts by travel date, soonest first, no date last, then by id; and by any column either way", async () => {
    // Zoya's and Arjun's trips start the same day: Zoya's booking, made first, has the lower id.
    await aTableBooking({ name: "Zoya", startDate: "2026-12-20", totalPaise: 50_000_00 });
    await aTableBooking({ name: "Arjun", startDate: "2026-12-20", totalPaise: 90_000_00 });
    await aTableBooking({ name: "Meera", startDate: null, totalPaise: 70_000_00 });
    await aTableBooking({ name: "Bela", startDate: "2026-11-15", totalPaise: 20_000_00 });
    const { seller } = world;
    expect(await names(seller)).toEqual(["Bela", "Zoya", "Arjun", "Meera"]);
    expect(await names(seller, { direction: "desc" })).toEqual(["Arjun", "Zoya", "Bela", "Meera"]);
    expect(await names(seller, { sort: "customer" })).toEqual(["Arjun", "Bela", "Meera", "Zoya"]);
    expect(await names(seller, { sort: "customer", direction: "desc" })).toEqual(["Zoya", "Meera", "Bela", "Arjun"]);
    expect(await names(seller, { sort: "total" })).toEqual(["Bela", "Zoya", "Meera", "Arjun"]);
    expect(await names(seller, { sort: "total", direction: "desc" })).toEqual(["Arjun", "Meera", "Zoya", "Bela"]);
  });

  it("counts every match across its pages and hands each page its own rows", async () => {
    for (let index = 0; index < 27; index += 1) {
      await aTableBooking({ name: `Customer ${String(index).padStart(2, "0")}`, startDate: "2026-12-20" });
    }
    const { seller } = world;
    const one = await page(seller);
    const two = await page(seller, { page: 2 });
    expect([one.total, two.total]).toEqual([27, 27]);
    expect([one.items.length, two.items.length]).toEqual([25, 2]);
    expect(new Set([...one.items, ...two.items].map((item) => item.id)).size).toBe(27);
    expect((await page(seller, { page: 3 })).items).toEqual([]);
    expect((await page(seller, { page: 1, limit: 50 })).items).toHaveLength(27);
  });

  it("gives each row its travellers and salesperson", async () => {
    await aTableBooking({ name: "Meera", adults: 3, children: 1 });
    const [item] = (await page(world.manager)).items;
    expect(item).toMatchObject({ customerName: "Meera", adults: 3, children: 1, ownerUserId: world.seller.userId });
  });

  it("holds a member who sees only their own to theirs, total and search too, and ignores their salesperson filter", async () => {
    await aTableBooking({ name: "Mine" });
    await aTableBooking({ name: "Theirs", ownerUserId: world.manager.userId });
    const { seller, manager } = world;
    expect(await page(manager)).toMatchObject({ total: 2 });
    const mine = await page(seller);
    expect(mine.total).toBe(1);
    expect(mine.items.map((item) => item.customerName)).toEqual(["Mine"]);
    expect(await names(seller, { search: "Theirs" })).toEqual([]);
    expect(await page(seller, { ownerUserId: manager.userId })).toMatchObject({
      total: 1,
      items: [{ customerName: "Mine" }],
    });
    await expect(names(seller, { payment: "nothing" })).resolves.toEqual(["Mine"]);
  });
});
