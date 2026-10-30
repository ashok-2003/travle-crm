// A departure's seats (release 7a): sold, held and free are worked out from the bookings and holds, never stored. A hold
// locks the departure and refuses more than the free seats; a booking made from an accepted quote on the departure turns the
// lead's hold into the booking, and a quote accepted on a full departure still stands, shown as overbooked.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelBooking } from "../../src/bookings/index.js";
import {
  cancelDeparture,
  createDeparture,
  createHold,
  expireHolds,
  getDeparture,
  listDepartures,
  releaseHold,
  setDepartureStatus,
  updateDeparture,
} from "../../src/departures/index.js";
import { aBookingOn, aDeparture, aSellersLead, now, openWorld, type World } from "./support.js";

const dayInput = {
  title: "Spiti batch",
  destinationId: null,
  startDate: "2026-11-20",
  endDate: "2026-11-27",
  seatsTotal: 10,
  pricePaise: null,
  cutoffOn: null,
  notes: "",
};

describe("departures and their seats", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Departure seats");
  });
  afterAll(async () => {
    await world.close();
  });

  it("is made, changed, and listed by date as upcoming, past or cancelled", async () => {
    const created = await world.inOrg((tx) => createDeparture(tx, world.manager, dayInput));
    await world.inOrg((tx) =>
      updateDeparture(tx, world.manager, { ...dayInput, departureId: created.id, seatsTotal: 12 }),
    );
    const past = await world.inOrg((tx) =>
      aDeparture(tx, { title: "Old batch", startDate: "2026-09-01", endDate: "2026-09-05" }),
    );
    const upcoming = await world.inOrg((tx) => listDepartures(tx, world.manager, { filter: "upcoming" }, now));
    expect(upcoming.find((row) => row.id === created.id)).toMatchObject({
      title: "Spiti batch",
      seatsTotal: 12,
      sold: 0,
      held: 0,
      free: 12,
      state: "open",
    });
    expect(upcoming.some((row) => row.id === past.id)).toBe(false);
    const pastList = await world.inOrg((tx) => listDepartures(tx, world.manager, { filter: "past" }, now));
    expect(pastList.some((row) => row.id === past.id)).toBe(true);
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: created.id }, orderBy: { id: "asc" } }),
    );
    expect(audit.map((entry) => entry.action)).toEqual(["departure.created", "departure.changed"]);
  });

  it("holds seats until they expire, and refuses more than are free", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 5 }));
    const lead = await aSellersLead(world);
    const other = await aSellersLead(world);
    const hold = await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 3, note: "" }, now),
    );
    expect(hold.expiresAt.toISOString()).toBe("2026-10-31T06:30:00.000Z");
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).free).toBe(2);
    await expect(
      world.inOrg((tx) =>
        createHold(tx, world.seller, { departureId: departure.id, leadId: other.id, seats: 3, note: "" }, now),
      ),
    ).rejects.toMatchObject({ reason: "DEPARTURE_FULL" });
    await expect(
      world.inOrg((tx) =>
        createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1, note: "" }, now),
      ),
    ).rejects.toMatchObject({ reason: "HOLD_EXISTS" });
    // Past its time, a hold no longer counts, even before the job marks it expired.
    const later = new Date("2026-11-01T00:00:00Z");
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, later))).free).toBe(5);
  });

  it("lets staff hold for fewer hours than the default", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx));
    const lead = await aSellersLead(world);
    const hold = await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1, hours: 6, note: "" }, now),
    );
    expect(hold.expiresAt.toISOString()).toBe("2026-10-29T12:30:00.000Z");
  });

  it("gives the last seat to one of two people who ask at the same moment", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 1 }));
    const [a, b] = [await aSellersLead(world), await aSellersLead(world)];
    const results = await Promise.allSettled(
      [a, b].map((lead) =>
        world.inOrg((tx) =>
          createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1, note: "" }, now),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("frees the seats when a hold is released", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 4 }));
    const lead = await aSellersLead(world);
    const hold = await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 4, note: "" }, now),
    );
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).state).toBe("full");
    await world.inOrg((tx) => releaseHold(tx, world.seller, hold.id, now));
    await world.inOrg((tx) => releaseHold(tx, world.seller, hold.id, now));
    expect(await world.inOrg((tx) => getDeparture(tx, departure.id, now))).toMatchObject({
      free: 4,
      state: "open",
      holds: [],
    });
  });

  it("reads Filling fast at the agency's percent of free seats, and Closed when staff close it", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    const lead = await aSellersLead(world);
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 8, note: "" }, now),
    );
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).state).toBe("filling");
    await world.inOrg((tx) => setDepartureStatus(tx, world.manager, { departureId: departure.id, status: "closed" }));
    expect((await world.inOrg((tx) => getDeparture(tx, departure.id, now))).state).toBe("closed");
    const refused = await aSellersLead(world);
    await expect(
      world.inOrg((tx) =>
        createHold(tx, world.seller, { departureId: departure.id, leadId: refused.id, seats: 1, note: "" }, now),
      ),
    ).rejects.toMatchObject({ reason: "DEPARTURE_NOT_OPEN" });
  });

  it("counts a booking's heads as sold, turns the lead's hold into the booking, and frees the seats on cancel", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    const lead = await aSellersLead(world);
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 3, note: "" }, now),
    );
    // The traveller accepts a quote for the same lead on this departure.
    const { bookingId, leadId } = await aBookingOn(world, departure.id, { adults: 2, children: 1, leadId: lead.id });
    const detail = await world.inOrg((tx) => getDeparture(tx, departure.id, now));
    expect(detail).toMatchObject({ sold: 3, held: 0, free: 7, holds: [] });
    expect(detail.bookings).toMatchObject([{ bookingId, leadId, heads: 3, status: "requested" }]);
    const hold = await world.inOrg((tx) => tx.departureHold.findFirstOrThrow({ where: { departureId: departure.id } }));
    expect(hold).toMatchObject({ status: "converted", bookingId });
    await world.inOrg((tx) => cancelBooking(tx, world.manager, { bookingId, reason: "Changed plans" }, now));
    expect(await world.inOrg((tx) => getDeparture(tx, departure.id, now))).toMatchObject({
      sold: 0,
      free: 10,
      bookings: [],
    });
  });

  it("stands a quote accepted on a full departure, shows it overbooked, and gives the lead's owner a task", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 2 }));
    await aBookingOn(world, departure.id, { adults: 2 });
    const { bookingId } = await aBookingOn(world, departure.id, { adults: 2 });
    const detail = await world.inOrg((tx) => getDeparture(tx, departure.id, now));
    expect(detail).toMatchObject({ sold: 4, free: 0, overbookedBy: 2, state: "full" });
    const tasks = await world.inOrg((tx) =>
      tx.task.findMany({
        where: { recordType: "booking", recordId: bookingId, title: { startsWith: "Overbooked by 2" } },
      }),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeUserId: world.seller.userId });
    const events = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "departure.overbooked" } }));
    expect(events.some((event) => (event.payload as { bookingId?: string }).bookingId === bookingId)).toBe(true);
  });

  it("expires holds whose time has come once, tells the owner, and leaves a task", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 6 }));
    const lead = await aSellersLead(world);
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 2, hours: 1, note: "" }, now),
    );
    const later = new Date("2026-10-29T08:00:00Z");
    expect(await world.inOrg((tx) => expireHolds(tx, world.organizationId, now))).toBe(0);
    expect(await world.inOrg((tx) => expireHolds(tx, world.organizationId, later))).toBe(1);
    expect(await world.inOrg((tx) => expireHolds(tx, world.organizationId, later))).toBe(0);
    const tasks = await world.inOrg((tx) => tx.task.findMany({ where: { recordType: "lead", recordId: lead.id } }));
    expect(tasks).toMatchObject([
      { title: expect.stringMatching(/^Hold expired: /) as string, assigneeUserId: world.seller.userId },
    ]);
    const told = await world.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "departure.hold-expired", recipientUserId: world.seller.userId } }),
    );
    expect(told.length).toBeGreaterThan(0);
    expect(
      await world.inOrg((tx) => tx.departureHold.findFirstOrThrow({ where: { departureId: departure.id } })),
    ).toMatchObject({
      status: "expired",
    });
  });

  it("is cancelled with a reason: its bookings stay, its holds are released and its waitlist cleared", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 8 }));
    const { bookingId } = await aBookingOn(world, departure.id, { adults: 2 });
    const lead = await aSellersLead(world);
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1, note: "" }, now),
    );
    await world.inOrg((tx) =>
      cancelDeparture(tx, world.manager, { departureId: departure.id, reason: "Landslide on the route" }, now),
    );
    const detail = await world.inOrg((tx) => getDeparture(tx, departure.id, now));
    expect(detail).toMatchObject({
      status: "cancelled",
      state: "cancelled",
      cancelledReason: "Landslide on the route",
      holds: [],
    });
    expect(detail.bookings.map((booking) => booking.bookingId)).toEqual([bookingId]);
    const cancelled = await world.inOrg((tx) => listDepartures(tx, world.manager, { filter: "cancelled" }, now));
    expect(cancelled.some((row) => row.id === departure.id)).toBe(true);
  });

  it("refuses two active holds for one lead even when both ask at once, and a lapsed hold does not block a new one", async () => {
    const departure = await world.inOrg((tx) => aDeparture(tx, { seatsTotal: 10 }));
    const lead = await aSellersLead(world);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        world.inOrg((tx) =>
          createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 1, note: "" }, now),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { reason: "HOLD_EXISTS" } });
    const later = new Date("2026-11-02T00:00:00Z");
    await world.inOrg((tx) =>
      createHold(tx, world.seller, { departureId: departure.id, leadId: lead.id, seats: 2, note: "" }, later),
    );
    expect(await world.inOrg((tx) => tx.departureHold.count({ where: { leadId: lead.id, status: "active" } }))).toBe(1);
  });

  it("refuses a last day to book after the trip starts", async () => {
    const created = await world.inOrg((tx) => createDeparture(tx, world.manager, dayInput));
    expect(created.id).toBeTruthy();
    const { createDepartureInput } = await import("@travel-crm/contracts/departures");
    expect(createDepartureInput.safeParse({ ...dayInput, cutoffOn: "2026-11-21" }).success).toBe(false);
    expect(createDepartureInput.safeParse({ ...dayInput, cutoffOn: "2026-11-20" }).success).toBe(true);
    await expect(
      world.inOrg((tx) =>
        tx.departure.update({ where: { id: created.id }, data: { cutoffOn: new Date("2026-12-01") } }),
      ),
    ).rejects.toThrow();
  });
});
