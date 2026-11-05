// Departures made from a group package's weekly days, against the real database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelDeparture, createDeparture, getDeparture, listDepartures } from "../../src/departures/index.js";
import { generatePackageDepartures, runPackageDepartures } from "../../src/departures/package-departures.js";
import { parseCalendarDate, systemActor } from "../../src/kernel/index.js";
import { deletePackage } from "../../src/quotes/index.js";
import { now, openWorld, type World } from "./support.js";

const FRIDAY_AND_SATURDAY = [5, 6];

describe("departures of a package", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("PackageDepartures");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aGroupPackage(changes: { weeklyDays?: number[]; departureMonths?: number[] } = {}) {
    counter += 1;
    const name = `Spiti batch ${String(counter)}`;
    return world.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name,
          title: name,
          kind: "group",
          nights: 6,
          seatsPerDeparture: 12,
          weeklyDays: changes.weeklyDays ?? FRIDAY_AND_SATURDAY,
          departureMonths: changes.departureMonths ?? [],
        },
        select: { id: true, name: true },
      }),
    );
  }
  const generate = (packageId: string, today: string) =>
    world.inOrg((tx) =>
      generatePackageDepartures(tx, systemActor(world.organizationId), packageId, parseCalendarDate(today)),
    );
  const startsOf = (packageId: string) =>
    world
      .inOrg((tx) =>
        tx.departure.findMany({
          where: { templateId: packageId },
          orderBy: { startDate: "asc" },
          select: { startDate: true },
        }),
      )
      .then((rows) => rows.map((row) => row.startDate.toISOString().slice(0, 10)));

  it("makes the Friday and Saturday departures of the next twelve weeks", async () => {
    const pack = await aGroupPackage();
    const result = await generate(pack.id, "2026-11-02");
    expect(result.created).toBe(24);
    const starts = await startsOf(pack.id);
    expect(starts).toHaveLength(24);
    expect(starts[0]).toBe("2026-11-06");
    const first = await world.inOrg((tx) =>
      tx.departure.findFirstOrThrow({ where: { templateId: pack.id }, orderBy: { startDate: "asc" } }),
    );
    expect(first).toMatchObject({ title: pack.name, seatsTotal: 12, pricePaise: null, priceDoublePaise: null });
    expect(first.endDate.toISOString().slice(0, 10)).toBe("2026-11-12");
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { action: "departure.created", entityId: first.id } }),
    );
    expect(audit).toBe(1);
  });

  it("only in the months chosen, across the new year", async () => {
    const pack = await aGroupPackage({ departureMonths: [12, 1] });
    await generate(pack.id, "2026-11-20");
    const starts = await startsOf(pack.id);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((day) => day.startsWith("2026-12") || day.startsWith("2027-01"))).toBe(true);
    expect(starts.some((day) => day.startsWith("2026-12"))).toBe(true);
    expect(starts.some((day) => day.startsWith("2027-01"))).toBe(true);
    expect(starts.some((day) => day.startsWith("2027-02"))).toBe(false);
  });

  it("never makes again a departure staff cancelled or deleted", async () => {
    const pack = await aGroupPackage();
    await generate(pack.id, "2026-11-02");
    const rows = await world.inOrg((tx) =>
      tx.departure.findMany({ where: { templateId: pack.id }, orderBy: { startDate: "asc" }, select: { id: true } }),
    );
    const [cancelled, deleted] = rows;
    if (cancelled === undefined || deleted === undefined) throw new Error("No departures were made");
    await world.inOrg((tx) =>
      cancelDeparture(tx, world.manager, { departureId: cancelled.id, reason: "Road closed" }, now),
    );
    await world.inOrg((tx) =>
      tx.departure.update({ where: { id: deleted.id }, data: { deletedAt: now, deletedBy: world.manager.userId } }),
    );
    expect((await generate(pack.id, "2026-11-02")).created).toBe(0);
  });

  it("running twice makes nothing new", async () => {
    const pack = await aGroupPackage();
    await generate(pack.id, "2026-11-02");
    expect((await generate(pack.id, "2026-11-02")).created).toBe(0);
    const next = await generate(pack.id, "2026-11-09");
    expect(next.created).toBe(2);
    expect(await startsOf(pack.id)).toHaveLength(26);
  });

  it("a package with departures can't be deleted", async () => {
    const pack = await aGroupPackage();
    await generate(pack.id, "2026-11-02");
    const refusal = await world
      .inOrg((tx) => deletePackage(tx, world.manager, pack.id))
      .then(
        () => null,
        (error: unknown) => (error as { reason?: string }).reason ?? "other",
      );
    expect(refusal).toBe("PACKAGE_HAS_DEPARTURES");
  });

  it("a package can go once its departures are cancelled or past, not while one is coming", async () => {
    const reasonOf = (id: string) =>
      world
        .inOrg((tx) => deletePackage(tx, world.manager, id))
        .then(
          () => null,
          (error: unknown) => (error as { reason?: string }).reason ?? "other",
        );
    const make = async (startDate: string, status: string) => {
      const pack = await aGroupPackage();
      await world.inOrg((tx) =>
        tx.departure.create({
          data: {
            title: pack.name,
            templateId: pack.id,
            startDate: new Date(`${startDate}T00:00:00Z`),
            endDate: new Date(`${startDate}T00:00:00Z`),
            seatsTotal: 5,
            status,
            ...(status === "cancelled" ? { cancelledReason: "Road closed" } : {}),
          },
        }),
      );
      return pack.id;
    };
    expect(await reasonOf(await make("2999-01-01", "cancelled"))).toBeNull();
    expect(await reasonOf(await make("2020-01-01", "open"))).toBeNull();
    expect(await reasonOf(await make("2999-01-01", "open"))).toBe("PACKAGE_HAS_DEPARTURES");
  });

  it("the nightly run makes none for an agency whose plan lacks the departures module", async () => {
    await aGroupPackage();
    const dependencies = (modules: string[]) => ({
      db: world.db,
      identity: { organizationsPage: () => Promise.resolve([{ id: world.organizationId }]) },
      subscriptions: { entitlementsOf: () => Promise.resolve({ access: "full", modules: new Set(modules) }) },
      logger: { error: () => undefined },
    });
    const run = (modules: string[]) =>
      runPackageDepartures(
        dependencies(modules) as unknown as Parameters<typeof runPackageDepartures>[0],
        new Date("2026-11-02T06:00:00Z"),
      );
    expect(await run(["crm"])).toBe(0);
    expect(await run(["departures"])).toBeGreaterThan(0);
  });

  it("lists a package's departures", async () => {
    const pack = await aGroupPackage({ weeklyDays: [5] });
    const other = await aGroupPackage({ weeklyDays: [6] });
    await generate(pack.id, "2026-11-02");
    await generate(other.id, "2026-11-02");
    const listed = await world.inOrg((tx) =>
      listDepartures(tx, world.manager, { filter: "upcoming", templateId: pack.id }, now),
    );
    expect(listed).toHaveLength(12);
    expect(listed.every((row) => row.title === pack.name)).toBe(true);
  });

  it("a linked departure with its own prices shows its lowest as the per-person figure, and takes the package's destination", async () => {
    const pack = await aGroupPackage();
    const destination = await world.inOrg((tx) =>
      tx.destination.create({ data: { name: "Spiti Valley" }, select: { id: true } }),
    );
    await world.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: pack.id }, data: { destinationId: destination.id } }),
    );
    const created = await world.inOrg((tx) =>
      createDeparture(tx, world.manager, {
        title: "Own prices",
        destinationId: null,
        startDate: "2027-03-05",
        endDate: "2027-03-11",
        seatsTotal: 10,
        pricePaise: null,
        cutoffOn: null,
        notes: "",
        templateId: pack.id,
        prices: { single: 3_000_000, double: 2_400_000, triple: null, quad: null, child_bed: null, child_no_bed: null },
      }),
    );
    const detail = await world.inOrg((tx) => getDeparture(tx, created.id, now));
    expect(detail).toMatchObject({ pricePaise: 2_400_000, destinationId: destination.id, templateId: pack.id });
    expect(detail.prices.single).toBe(3_000_000);
  });
});
