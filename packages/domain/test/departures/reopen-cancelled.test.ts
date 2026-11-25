// Opening a cancelled departure again, while its start day is still ahead: seats back, reason cleared, audited.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelBooking } from "../../src/bookings/index.js";
import { cancelDeparture, reopenCancelledDeparture } from "../../src/departures/index.js";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { aBookingOn, aDeparture, now, openWorld, type World } from "./support.js";

const today = parseCalendarDate("2026-11-02");

describe("reopening a cancelled departure", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("ReopenCancelled");
  });
  afterAll(async () => {
    await world.close();
  });

  const cancelled = async (startDate = "2026-11-10") => {
    const made = await world.inOrg((tx) => aDeparture(tx, { startDate, endDate: "2026-11-16", seatsTotal: 14 }));
    await world.inOrg((tx) => cancelDeparture(tx, world.manager, { departureId: made.id, reason: "Road closed" }, now));
    return made.id;
  };
  const reopen = (departureId: string, on = today) =>
    world.inOrg((tx) => reopenCancelledDeparture(tx, world.manager, departureId, on));

  it("reopens a cancelled departure: open again, with its seats, the reason cleared and a departure.reopened audit entry", async () => {
    const id = await cancelled();
    await reopen(id);
    const row = await world.inOrg((tx) => tx.departure.findUniqueOrThrow({ where: { id } }));
    expect(row).toMatchObject({ status: "open", cancelledReason: null, seatsTotal: 14 });
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: id, action: "departure.reopened" } }),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ before: { status: "cancelled" }, after: { status: "open" } });
  });

  it("refuses a departure that isn't cancelled", async () => {
    const made = await world.inOrg((tx) => aDeparture(tx, { startDate: "2026-11-12", endDate: "2026-11-16" }));
    await expect(reopen(made.id)).rejects.toMatchObject({ code: "CONFLICT", reason: "DEPARTURE_NOT_CANCELLED" });
  });

  it("refuses a departure whose start date is before today", async () => {
    const id = await cancelled("2026-10-20");
    await expect(reopen(id)).rejects.toMatchObject({ reason: "DEPARTURE_IN_PAST" });
  });

  it("leaves the departure's cancelled bookings cancelled", async () => {
    const made = await world.inOrg((tx) => aDeparture(tx, { startDate: "2026-11-20", endDate: "2026-11-24" }));
    const { bookingId } = await aBookingOn(world, made.id);
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Changed plans" }, now));
    await world.inOrg((tx) => cancelDeparture(tx, world.manager, { departureId: made.id, reason: "Road closed" }, now));
    await reopen(made.id);
    const booking = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId } }));
    expect(booking.status).toBe("cancelled");
  });
});
