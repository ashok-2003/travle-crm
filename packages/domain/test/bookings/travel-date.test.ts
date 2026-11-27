// A booking keeps its own travel date (bookings revamp, Task 6): setting it moves the end date by the trip's length and
// the details cut-off with it, makes the unsent reminders again and keeps the sent ones, leaves the payments due alone,
// is audited, and is refused for a booking on a group departure or one that was cancelled.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmBooking, getBooking, setTravelDate } from "../../src/bookings/index.js";
import { aBookingOn, aDeparture } from "../departures/support.js";
import { aBooking, openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z");
const dayOf = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("a booking's travel date", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Travel date");
  });
  afterAll(async () => {
    await world.close();
  });

  it("moves the end date by the trip's length, rebuilds the unsent reminders and keeps the sent and the payments due", async () => {
    const { bookingId, quoteId } = await aBooking(world, { totalPaise: 100_000_00, days: 3 });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    const before = await world.inOrg((tx) => tx.bookingReminder.findMany({ where: { bookingId } }));
    const sent = before.find((row) => row.kind === "details");
    expect(sent).toBeDefined();
    await world.inOrg((tx) =>
      tx.bookingReminder.update({ where: { id: sent?.id ?? "" }, data: { status: "sent", sentAt: now } }),
    );
    const duesBefore = await world.inOrg((tx) =>
      tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } }),
    );

    await world.inOrg((tx) => setTravelDate(tx, world.seller, { bookingId, startDate: "2026-12-30" }, now));

    const row = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect([dayOf(row.startDate), dayOf(row.endDate)]).toEqual(["2026-12-30", "2027-01-01"]);
    const after = await world.inOrg((tx) => tx.bookingReminder.findMany({ where: { bookingId } }));
    const details = after.filter((reminder) => reminder.kind === "details");
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ status: "sent", sendAt: sent?.sendAt });
    const reporting = after.find((reminder) => reminder.kind === "reporting");
    expect(reporting?.status).toBe("scheduled");
    expect(reporting?.sendAt.getTime()).toBeGreaterThan(new Date("2026-12-28T00:00:00Z").getTime());
    const duesAfter = await world.inOrg((tx) =>
      tx.quoteInstallment.findMany({ where: { quoteId }, orderBy: { dueOn: "asc" } }),
    );
    expect(duesAfter.map((due) => [due.id, due.dueOn])).toEqual(duesBefore.map((due) => [due.id, due.dueOn]));
    const shown = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(shown.detailsCutoffOn).toBe("2026-12-27");
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: bookingId, action: "booking.travel-date-changed" } }),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.before).toMatchObject({ startDate: "2026-12-20" });
    expect(audit[0]?.after).toMatchObject({ startDate: "2026-12-30", endDate: "2027-01-01" });
  });

  it("sets the date of a booking that had none, and changing it to the same day adds no audit entry", async () => {
    const { bookingId } = await aBooking(world, { startDate: null, days: 2 });
    await world.inOrg((tx) => setTravelDate(tx, world.seller, { bookingId, startDate: "2027-02-10" }, now));
    const row = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect([dayOf(row.startDate), dayOf(row.endDate)]).toEqual(["2027-02-10", "2027-02-11"]);
    await world.inOrg((tx) => setTravelDate(tx, world.seller, { bookingId, startDate: "2027-02-10" }, now));
    expect(
      await world.inOrg((tx) =>
        tx.auditEntry.count({ where: { entityId: bookingId, action: "booking.travel-date-changed" } }),
      ),
    ).toBe(1);
  });

  it("refuses a booking on a group departure, which follows its departure", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    const { bookingId } = await aBookingOn(world, departure.id);
    await expect(
      world.inOrg((tx) => setTravelDate(tx, world.seller, { bookingId, startDate: "2026-12-30" }, now)),
    ).rejects.toMatchObject({ reason: "BOOKING_ON_DEPARTURE" });
  });

  it("refuses a cancelled booking", async () => {
    const { bookingId } = await aBooking(world);
    await world.inOrg((tx) =>
      tx.booking.update({ where: { id: bookingId }, data: { status: "cancelled", cancelledAt: now } }),
    );
    await expect(
      world.inOrg((tx) => setTravelDate(tx, world.seller, { bookingId, startDate: "2026-12-30" }, now)),
    ).rejects.toMatchObject({ reason: "BOOKING_CANCELLED" });
  });
});
