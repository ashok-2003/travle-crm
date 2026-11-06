// Departures made from a group package's weekly days, against the real database.
import type { RoomPrices } from "@travel-crm/contracts/quotes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelDeparture,
  createDeparture,
  getDeparture,
  listDepartures,
  reconcilePackageDepartures,
  updateDeparture,
} from "../../src/departures/index.js";
import { generatePackageDepartures, runPackageDepartures } from "../../src/departures/package-departures.js";
import { parseCalendarDate, systemActor } from "../../src/kernel/index.js";
import { deletePackage } from "../../src/quotes/index.js";
import { aQuote } from "../bookings/support.js";
import { aBookingOn, aSellersLead, now, openWorld, type World } from "./support.js";

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

  describe("a schedule change", () => {
    const TODAY = "2026-11-02";
    const reconcile = (packageId: string) =>
      world.inOrg((tx) =>
        reconcilePackageDepartures(tx, systemActor(world.organizationId), packageId, parseCalendarDate(TODAY)),
      );
    const rowOn = (packageId: string, day: string) =>
      world.inOrg((tx) =>
        tx.departure.findFirstOrThrow({ where: { templateId: packageId, startDate: new Date(`${day}T00:00:00Z`) } }),
      );
    const noticesAbout = (departureId: string) =>
      world.inOrg((tx) =>
        tx.notification.count({
          where: { kind: "departure.schedule-kept", link: { contains: departureId } },
        }),
      );

    it("generated departures carry the day they were made for", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const rows = await world.inOrg((tx) => tx.departure.findMany({ where: { templateId: pack.id } }));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.scheduledOn?.getTime() === row.startDate.getTime())).toBe(true);
    });

    it("cancels future generated departures that no longer match, and keeps any with a booking or hold, telling the team", async () => {
      const pack = await aGroupPackage();
      await generate(pack.id, TODAY);
      // 2026-11-07 is a Saturday: one with a booking, one with a hold, one with nothing, one staff added by hand.
      const booked = await rowOn(pack.id, "2026-11-07");
      const held = await rowOn(pack.id, "2026-11-14");
      const plain = await rowOn(pack.id, "2026-11-21");
      const movedByStaff = await rowOn(pack.id, "2026-11-28");
      const handMade = await world.inOrg((tx) =>
        tx.departure.create({
          data: {
            title: "Added by staff",
            templateId: pack.id,
            startDate: new Date("2027-02-06T00:00:00Z"),
            endDate: new Date("2027-02-12T00:00:00Z"),
            seatsTotal: 8,
          },
        }),
      );
      await world.inOrg((tx) =>
        tx.departure.update({
          where: { id: movedByStaff.id },
          data: { scheduledOn: new Date("2026-11-27T00:00:00Z") },
        }),
      );
      await aBookingOn(world, booked.id, { leadId: (await aSellersLead(world)).id });
      const holder = await aSellersLead(world);
      await world.inOrg((tx) =>
        tx.departureHold.create({
          data: { departureId: held.id, leadId: holder.id, seats: 2, expiresAt: new Date("2999-01-01T00:00:00Z") },
        }),
      );
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: pack.id }, data: { weeklyDays: [5] } }));

      const result = await reconcile(pack.id);

      const status = async (id: string) =>
        (await world.inOrg((tx) => tx.departure.findUniqueOrThrow({ where: { id } }))).status;
      expect(await status(plain.id)).toBe("cancelled");
      expect(await status(booked.id)).toBe("open");
      expect(await status(held.id)).toBe("open");
      expect(await status(movedByStaff.id)).toBe("open");
      expect(await status(handMade.id)).toBe("open");
      expect(result.kept).toBe(2);
      expect(result.cancelled).toBeGreaterThan(2);
      const audit = await world.inOrg((tx) =>
        tx.auditEntry.count({ where: { action: "departure.cancelled", entityId: plain.id } }),
      );
      expect(audit).toBe(1);
      expect(await noticesAbout(booked.id)).toBe(1);
      expect(await noticesAbout(held.id)).toBe(1);
      expect(await noticesAbout(plain.id)).toBe(0);
      // Said once: a second look tells the team nothing new.
      await reconcile(pack.id);
      expect(await noticesAbout(booked.id)).toBe(1);
    });

    it("changes the end and seats of matching departures with no sales, and keeps the ones with a hold, telling the team", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const free = await rowOn(pack.id, "2026-11-06");
      const held = await rowOn(pack.id, "2026-11-13");
      const holder = await aSellersLead(world);
      await world.inOrg((tx) =>
        tx.departureHold.create({
          data: { departureId: held.id, leadId: holder.id, seats: 1, expiresAt: new Date("2999-01-01T00:00:00Z") },
        }),
      );
      await world.inOrg((tx) =>
        tx.quoteTemplate.update({ where: { id: pack.id }, data: { nights: 8, seatsPerDeparture: 15 } }),
      );
      const result = await reconcile(pack.id);
      const after = await rowOn(pack.id, "2026-11-06");
      expect(after).toMatchObject({ seatsTotal: 15 });
      expect(after.endDate.toISOString().slice(0, 10)).toBe("2026-11-14");
      const kept = await rowOn(pack.id, "2026-11-13");
      expect(kept).toMatchObject({ seatsTotal: 12 });
      expect(result.updated).toBeGreaterThan(0);
      expect(result.kept).toBe(1);
      expect(await noticesAbout(held.id)).toBe(1);
      expect(await noticesAbout(free.id)).toBe(0);
    });
    it("a schedule changed Friday to Saturday and back to Friday reopens the Fridays it cancelled", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const friday = await rowOn(pack.id, "2026-11-13");
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: pack.id }, data: { weeklyDays: [6] } }));
      await reconcile(pack.id);
      expect((await rowOn(pack.id, "2026-11-13")).status).toBe("cancelled");
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: pack.id }, data: { weeklyDays: [5] } }));
      await generate(pack.id, TODAY);
      const again = await rowOn(pack.id, "2026-11-13");
      expect(again).toMatchObject({ id: friday.id, status: "open", cancelledReason: null });
      const reopened = await world.inOrg((tx) =>
        tx.auditEntry.count({ where: { action: "departure.reopened", entityId: friday.id } }),
      );
      expect(reopened).toBe(1);
    });

    it("a Friday staff cancelled stays cancelled", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const friday = await rowOn(pack.id, "2026-11-13");
      await world.inOrg((tx) =>
        cancelDeparture(tx, world.manager, { departureId: friday.id, reason: "Road closed" }, now),
      );
      await generate(pack.id, TODAY);
      expect((await rowOn(pack.id, "2026-11-13")).status).toBe("cancelled");
    });

    it("a declined quote does not stop a cancel, a live one does", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const declined = await rowOn(pack.id, "2026-11-13");
      const live = await rowOn(pack.id, "2026-11-20");
      for (const [row, status] of [
        [declined, "declined"],
        [live, "sent"],
      ] as const) {
        const { quote } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId }));
        await world.inOrg((tx) => tx.quote.update({ where: { id: quote.id }, data: { departureId: row.id, status } }));
      }
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: pack.id }, data: { weeklyDays: [6] } }));
      await reconcile(pack.id);
      expect((await rowOn(pack.id, "2026-11-13")).status).toBe("cancelled");
      expect((await rowOn(pack.id, "2026-11-20")).status).toBe("open");
    });

    it("a kept departure whose leads have no owner tells the members who manage departures", async () => {
      const pack = await aGroupPackage({ weeklyDays: [5] });
      await generate(pack.id, TODAY);
      const row = await rowOn(pack.id, "2026-11-13");
      const lead = await world.inOrg(async (tx) => {
        const { aLead } = await import("../crm/support/records.js");
        return aLead(tx, { ownerUserId: null });
      });
      await world.inOrg((tx) =>
        tx.departureHold.create({
          data: { departureId: row.id, leadId: lead.id, seats: 1, expiresAt: new Date("2999-01-01T00:00:00Z") },
        }),
      );
      await world.inOrg((tx) => tx.quoteTemplate.update({ where: { id: pack.id }, data: { weeklyDays: [6] } }));
      await world.inOrg((tx) =>
        reconcilePackageDepartures(tx, systemActor(world.organizationId), pack.id, parseCalendarDate(TODAY), [
          world.manager.userId,
        ]),
      );
      const told = await world.inOrg((tx) =>
        tx.notification.count({
          where: { kind: "departure.schedule-kept", link: { contains: row.id }, recipientUserId: world.manager.userId },
        }),
      );
      expect(told).toBe(1);
    });
  });

  it("updating a departure audits its package and own prices", async () => {
    const pack = await aGroupPackage();
    const made = await world.inOrg((tx) =>
      createDeparture(tx, world.manager, {
        title: "Audited",
        destinationId: null,
        startDate: "2027-05-07",
        endDate: "2027-05-13",
        seatsTotal: 10,
        pricePaise: null,
        cutoffOn: null,
        notes: "",
        templateId: pack.id,
        prices: { single: null, double: 2_400_000, triple: null, quad: null, child_bed: null, child_no_bed: null },
      }),
    );
    await world.inOrg((tx) =>
      updateDeparture(tx, world.manager, {
        departureId: made.id,
        title: "Audited",
        destinationId: null,
        startDate: "2027-05-07",
        endDate: "2027-05-13",
        seatsTotal: 10,
        pricePaise: null,
        cutoffOn: null,
        notes: "",
        templateId: pack.id,
        prices: { single: 3_000_000, double: 2_400_000, triple: null, quad: null, child_bed: null, child_no_bed: null },
      }),
    );
    const entry = await world.inOrg((tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "departure.changed", entityId: made.id } }),
    );
    expect(entry.before).toMatchObject({ templateId: pack.id, priceSinglePaise: null, priceDoublePaise: "2400000" });
    expect(entry.after).toMatchObject({
      templateId: pack.id,
      priceSinglePaise: "3000000",
      priceDoublePaise: "2400000",
    });
    const created = await world.inOrg((tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "departure.created", entityId: made.id } }),
    );
    expect(created.after).toMatchObject({ templateId: pack.id, priceDoublePaise: "2400000" });
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

  describe("a linked departure's per-person figure", () => {
    const none: RoomPrices = {
      single: null,
      double: null,
      triple: null,
      quad: null,
      child_bed: null,
      child_no_bed: null,
    };
    const input = (packageId: string, pricePaise: number | null, prices: RoomPrices = none) => ({
      title: "Figure batch",
      destinationId: null,
      startDate: "2027-04-02",
      endDate: "2027-04-08",
      seatsTotal: 10,
      pricePaise,
      cutoffOn: null,
      notes: "",
      templateId: packageId,
      prices,
    });

    it("is the lowest adult price, not a child's", async () => {
      const pack = await aGroupPackage();
      const created = await world.inOrg((tx) =>
        createDeparture(tx, world.manager, input(pack.id, null, { ...none, double: 2_400_000, child_bed: 900_000 })),
      );
      expect((await world.inOrg((tx) => getDeparture(tx, created.id, now))).pricePaise).toBe(2_400_000);
    });

    it("is none, not the single price typed, when it has no prices of its own", async () => {
      const pack = await aGroupPackage();
      const created = await world.inOrg((tx) => createDeparture(tx, world.manager, input(pack.id, 1_250_000)));
      expect((await world.inOrg((tx) => getDeparture(tx, created.id, now))).pricePaise).toBeNull();
    });

    it("goes when the departure's own prices are cleared, even if the form resends the old figure", async () => {
      const { updateDeparture } = await import("../../src/departures/index.js");
      const pack = await aGroupPackage();
      const created = await world.inOrg((tx) =>
        createDeparture(tx, world.manager, input(pack.id, null, { ...none, double: 2_400_000 })),
      );
      await world.inOrg((tx) =>
        updateDeparture(tx, world.manager, { departureId: created.id, ...input(pack.id, 2_400_000, none) }),
      );
      expect((await world.inOrg((tx) => getDeparture(tx, created.id, now))).pricePaise).toBeNull();
    });

    it("refuses a package that is not a group package of the agency, on create and on change", async () => {
      const { updateDeparture } = await import("../../src/departures/index.js");
      const custom = await world.inOrg((tx) =>
        tx.quoteTemplate.create({ data: { name: "Plain trip", title: "Plain" }, select: { id: true } }),
      );
      const reason = (promise: Promise<unknown>) =>
        promise.then(
          () => null,
          (error: unknown) => (error as { reason?: string }).reason ?? "other",
        );
      expect(await reason(world.inOrg((tx) => createDeparture(tx, world.manager, input(custom.id, null))))).toBe(
        "NOT_FOUND",
      );
      expect(
        await reason(
          world.inOrg((tx) => createDeparture(tx, world.manager, input("0190a000-0000-7000-8000-00000000dead", null))),
        ),
      ).toBe("NOT_FOUND");
      const group = await aGroupPackage();
      const made = await world.inOrg((tx) => createDeparture(tx, world.manager, input(group.id, null)));
      expect(
        await reason(
          world.inOrg((tx) => updateDeparture(tx, world.manager, { departureId: made.id, ...input(custom.id, null) })),
        ),
      ).toBe("NOT_FOUND");
    });

    it("a departure with no package keeps the one price typed", async () => {
      const created = await world.inOrg((tx) =>
        createDeparture(tx, world.manager, { ...input("", 1_250_000), templateId: null }),
      );
      expect((await world.inOrg((tx) => getDeparture(tx, created.id, now))).pricePaise).toBe(1_250_000);
    });
  });
});
