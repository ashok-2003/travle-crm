// The packages list's next departure: a group trip's first departure from today that is not cancelled, with its seats free;
// null for a custom trip or a trip with none; and read in a fixed number of queries whatever the number of trips.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { createPackage, listPackages } from "../../src/quotes/index.js";
import { countsOf, seatsSoldAndHeld } from "../../src/departures/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";
import { aBookingOn } from "../departures/support.js";

const today = parseCalendarDate("2026-11-10");

describe("the packages list's next departure", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("NextDeparture");
  });
  afterAll(async () => {
    await world.close();
  });

  const aTrip = async (kind: "group" | "custom") => {
    counter += 1;
    return (await world.inOrg((tx) => createPackage(tx, world.manager, { name: `Trip ${String(counter)}`, kind }))).id;
  };
  const depart = (templateId: string, start: string, seatsTotal: number, status = "open") =>
    world.inOrg(
      async (tx) =>
        (
          await tx.departure.create({
            data: {
              title: `Batch ${start}`,
              templateId,
              startDate: new Date(`${start}T00:00:00Z`),
              endDate: new Date(`${start}T00:00:00Z`),
              seatsTotal,
              status,
              cancelledReason: status === "cancelled" ? "Too few travellers" : null,
            },
            select: { id: true },
          })
        ).id,
    );
  const listed = async () => {
    const all = await world.inOrg((tx) => listPackages(tx, world.organizationId, today));
    return (id: string) => all.find((one) => one.id === id)?.nextDeparture;
  };

  it("is the earliest departure from today that is not cancelled, with its seats free", async () => {
    const first = await aTrip("group");
    const second = await aTrip("group");
    const custom = await aTrip("custom");
    await depart(first, "2026-11-05", 20);
    await depart(first, "2026-11-12", 20, "cancelled");
    const booked = await depart(first, "2026-11-20", 20);
    await depart(first, "2026-11-27", 20);
    await aBookingOn(world, booked, { adults: 3, confirmed: true });
    await depart(second, "2026-12-01", 8);
    await depart(custom, "2026-11-15", 8);
    const of = await listed();
    expect(of(first)).toEqual({ startDate: "2026-11-20", seatsFree: 17 });
    expect(of(second)).toEqual({ startDate: "2026-12-01", seatsFree: 8 });
    expect(of(custom)).toBeNull();
  });

  it("is null for a group trip with none ahead", async () => {
    const trip = await aTrip("group");
    await depart(trip, "2026-11-01", 20);
    await depart(trip, "2026-11-20", 20, "cancelled");
    expect((await listed())(trip)).toBeNull();
  });

  it("counts seats as the departures module does: a requested booking and an active hold both take seats", async () => {
    const trip = await aTrip("group");
    const id = await depart(trip, "2026-11-22", 20);
    await aBookingOn(world, id, { adults: 2, confirmed: false });
    const lead = await world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" }));
    await world.inOrg((tx) =>
      tx.departureHold.create({
        data: {
          departureId: id,
          leadId: lead.id,
          seats: 4,
          expiresAt: new Date("2099-01-01T00:00:00Z"),
          status: "active",
        },
      }),
    );
    const mine = await world.inOrg((tx) => tx.departure.findFirstOrThrow({ where: { id } }));
    const theirs = await world.inOrg(async (tx) => (await seatsSoldAndHeld(tx, [id], new Date())).get(id));
    expect(theirs).toEqual({ sold: 2, held: 4 });
    expect((await listed())(trip)).toEqual({
      startDate: "2026-11-22",
      seatsFree: countsOf(mine.seatsTotal, theirs?.sold ?? 0, theirs?.held ?? 0).free,
    });
    expect((await listed())(trip)?.seatsFree).toBe(14);
  });

  it("reads in the same number of queries however many trips there are, raw ones included", async () => {
    const count = async () => {
      let queries = 0;
      await world.inOrg(async (tx) => {
        const restore: (() => void)[] = [];
        const wrap = <T extends object>(owner: T, key: keyof T) => {
          const kept = owner[key];
          const original = (kept as (...args: unknown[]) => unknown).bind(owner);
          (owner as Record<keyof T, unknown>)[key] = (...args: unknown[]) => {
            queries += 1;
            return original(...args);
          };
          restore.push(() => {
            (owner as Record<keyof T, unknown>)[key] = kept;
          });
        };
        wrap(tx.departure, "findMany");
        wrap(tx, "$queryRaw");
        try {
          await listPackages(tx, world.organizationId, today);
        } finally {
          restore.forEach((undo) => {
            undo();
          });
        }
      });
      return queries;
    };
    const before = await count();
    for (let i = 0; i < 3; i += 1) await depart(await aTrip("group"), "2026-12-10", 10);
    expect(await count()).toBe(before);
  });
});
