// A member's New booking: one call makes the accepted quote and the confirmed booking with the default schedule, once, from a
// package or on a departure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBookingDirect, createBookingFromQuote, getBooking } from "../../src/bookings/index.js";
import { aLead } from "../crm/support/records.js";
import { aDeparture } from "../departures/support.js";
import { openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z");
const context = { supplierStateCode: "07", now };

describe("a booking made in one step", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("New booking");
  });
  afterAll(async () => {
    await world.close();
  });

  const input = (leadId: string, more: object = {}) => ({
    leadId,
    packageId: null,
    departureId: null,
    title: "Goa 4 nights",
    startDate: "2026-12-10",
    adults: 2,
    children: 1,
    totalPaise: 105_000_00,
    taxRateBasisPoints: 500 as const,
    ...more,
  });
  const aLeadOf = () => world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" }));
  const make = (more: object = {}) =>
    world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      return createBookingDirect(tx, world.seller, input(lead.id, more), context);
    });

  it("makes an accepted quote, a confirmed booking on the default schedule and a row for each traveller", async () => {
    const lead = await aLeadOf();
    const bookingId = await world.inOrg((tx) => createBookingDirect(tx, world.seller, input(lead.id), context));
    const booking = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(booking).toMatchObject({ status: "confirmed", travellersTotal: 3 });
    const row = await world.inOrg((tx) =>
      tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { quote: { select: { status: true, totalPaise: true, installments: true } } },
      }),
    );
    expect(row.quote.status).toBe("accepted");
    expect(row.quote.totalPaise).toBe(105_000_00n);
    expect(row.quote.installments.reduce((sum, due) => sum + due.amountPaise, 0n)).toBe(105_000_00n);
    const audits = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: bookingId }, select: { action: true } }),
    );
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["booking.created", "booking.confirmed"]),
    );
  });

  it("asks nobody to confirm what its maker just confirmed, and fills traveller 1 from the lead", async () => {
    const bookingId = await make();
    expect(await world.inOrg((tx) => tx.task.count({ where: { recordId: bookingId } }))).toBe(0);
    expect(await world.inOrg((tx) => tx.notification.count({ where: { kind: "booking.requested" } }))).toBe(0);
    const first = await world.inOrg((tx) =>
      tx.bookingTraveller.findFirstOrThrow({ where: { bookingId, position: 0 }, select: { prefilledFields: true } }),
    );
    expect(first.prefilledFields).toContain("name");
  });

  it("is not made twice when the quote.accepted listener runs", async () => {
    const bookingId = await make();
    const { quoteId } = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    const again = await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId, confirmed: false }, now),
    );
    expect(again).toBe(bookingId);
    expect(await world.inOrg((tx) => tx.booking.count({ where: { quoteId } }))).toBe(1);
  });

  it("takes a package's days, inclusions and terms", async () => {
    const pack = await world.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name: "Goa pack",
          title: "Goa pack",
          days: [
            { title: "Day 1", description: "" },
            { title: "Day 2", description: "" },
          ],
          inclusions: "Breakfast",
          notes: "Terms here",
        },
        select: { id: true },
      }),
    );
    const bookingId = await make({ packageId: pack.id });
    const { quote } = await world.inOrg((tx) =>
      tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { quote: true } }),
    );
    expect(quote).toMatchObject({ inclusions: "Breakfast", notes: "Terms here", templateId: pack.id });
    expect(quote.days).toHaveLength(2);
  });

  it("takes a departure's date and refuses one that is full with the departure's own reason", async () => {
    const pack = await world.inOrg((tx) =>
      tx.quoteTemplate.create({ data: { name: "Group", title: "Group", kind: "group" }, select: { id: true } }),
    );
    const departure = await world.inOrg(async (tx) => {
      const made = await aDeparture(tx, { startDate: "2026-12-20", endDate: "2026-12-24", seatsTotal: 4 });
      await tx.departure.update({ where: { id: made.id }, data: { templateId: pack.id } });
      return made;
    });
    const bookingId = await make({ packageId: pack.id, departureId: departure.id, startDate: "2026-12-01" });
    const booking = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(booking.startDate).toBe("2026-12-20");
    await expect(make({ packageId: pack.id, departureId: departure.id })).rejects.toMatchObject({
      reason: "NOT_ENOUGH_SEATS",
    });
  });
});
