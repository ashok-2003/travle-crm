// A trip's dates added in bulk: a departure for each day of a range, skipping days that already hold one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPackageDates, cancelDeparture } from "../../src/departures/index.js";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { now, openWorld, type World } from "./support.js";

const today = parseCalendarDate("2026-11-02");

describe("adding a package's dates", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("PackageDates");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aGroupPackage(changes: { nights?: number | null; seatsPerDeparture?: number | null } = {}) {
    counter += 1;
    const name = `Kinnaur batch ${String(counter)}`;
    return world.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name,
          title: name,
          kind: "group",
          nights: changes.nights === undefined ? 4 : changes.nights,
          seatsPerDeparture: changes.seatsPerDeparture === undefined ? 12 : changes.seatsPerDeparture,
        },
        select: { id: true, name: true },
      }),
    );
  }
  const add = (packageId: string, from: string, to: string, weekdays: number[] = [], on = today) =>
    world.inOrg((tx) =>
      addPackageDates(
        tx,
        world.manager,
        { packageId, from: parseCalendarDate(from), to: parseCalendarDate(to), weekdays },
        on,
      ),
    );
  const departuresOf = (packageId: string) =>
    world.inOrg((tx) => tx.departure.findMany({ where: { templateId: packageId }, orderBy: { startDate: "asc" } }));

  it("adds a departure on every day of the range, named after the trip, ending after its nights, with its seats per departure", async () => {
    const pack = await aGroupPackage();
    const result = await add(pack.id, "2026-12-01", "2026-12-03");
    expect(result).toEqual({ added: ["2026-12-01", "2026-12-02", "2026-12-03"], alreadyThere: [], cancelled: [] });
    const rows = await departuresOf(pack.id);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ title: pack.name, seatsTotal: 12, status: "open", pricePaise: null });
    expect(rows[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-12-05");
  });

  it("adds only the chosen weekdays", async () => {
    const pack = await aGroupPackage();
    // 4 Dec 2026 is a Friday.
    const result = await add(pack.id, "2026-12-01", "2026-12-13", [5, 6]);
    expect(result.added).toEqual(["2026-12-04", "2026-12-05", "2026-12-11", "2026-12-12"]);
  });

  it("lists days that already have a departure under alreadyThere and adds nothing there", async () => {
    const pack = await aGroupPackage();
    await add(pack.id, "2026-12-02", "2026-12-02");
    const result = await add(pack.id, "2026-12-01", "2026-12-03");
    expect(result).toEqual({ added: ["2026-12-01", "2026-12-03"], alreadyThere: ["2026-12-02"], cancelled: [] });
    expect(await departuresOf(pack.id)).toHaveLength(3);
  });

  it("lists a day holding a cancelled departure under cancelled, with its id, and adds nothing there", async () => {
    const pack = await aGroupPackage();
    await add(pack.id, "2026-12-02", "2026-12-02");
    const [existing] = await departuresOf(pack.id);
    if (existing === undefined) throw new Error("No departure was made");
    await world.inOrg((tx) =>
      cancelDeparture(tx, world.manager, { departureId: existing.id, reason: "Road closed" }, now),
    );
    const result = await add(pack.id, "2026-12-01", "2026-12-03");
    expect(result).toEqual({
      added: ["2026-12-01", "2026-12-03"],
      alreadyThere: [],
      cancelled: [{ date: "2026-12-02", departureId: existing.id }],
    });
    expect(await departuresOf(pack.id)).toHaveLength(3);
  });

  it("refuses a trip without nights or seats per departure", async () => {
    const noNights = await aGroupPackage({ nights: null });
    await expect(add(noNights.id, "2026-12-01", "2026-12-02")).rejects.toMatchObject({
      reason: "PACKAGE_SCHEDULE_INCOMPLETE",
    });
    const noSeats = await aGroupPackage({ seatsPerDeparture: null });
    await expect(add(noSeats.id, "2026-12-01", "2026-12-02")).rejects.toMatchObject({
      reason: "PACKAGE_SCHEDULE_INCOMPLETE",
    });
  });

  it("refuses a range starting today or earlier", async () => {
    const pack = await aGroupPackage();
    await expect(add(pack.id, "2026-11-02", "2026-11-05")).rejects.toMatchObject({ reason: "DATES_NOT_AHEAD" });
    await expect(add(pack.id, "2026-10-30", "2026-11-05")).rejects.toMatchObject({ reason: "DATES_NOT_AHEAD" });
  });
});
