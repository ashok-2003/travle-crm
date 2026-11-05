// Group fields on a package, and the "AI can sell" switch with the gaps that hold it back, against the real database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import {
  createQuote,
  getPackage,
  packageSellGaps,
  savePackage,
  savePackageSeason,
  sellablePackages,
  setPackagePaymentDetails,
  setPackageSellable,
  updatePackage,
} from "../../src/quotes/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";
import { aDeparture } from "../departures/support.js";
import type { RoomPrices, UpdatePackageInput } from "@travel-crm/contracts/quotes";

const today = parseCalendarDate("2026-11-10");
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};
const words = (overrides: Partial<UpdatePackageInput> = {}): Omit<UpdatePackageInput, "packageId"> => ({
  name: "Spiti batch",
  title: "Spiti batch",
  days: [],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  slug: null,
  destinationId: null,
  nights: 6,
  summary: "",
  highlights: [],
  priceDisplay: "on_enquiry",
  fromPricePaise: null,
  defaultTravellerLevel: null,
  cancellationNotes: "",
  kind: "custom",
  roomTypes: [],
  pricesIncludeGst: true,
  advancePerPersonPaise: null,
  pickupPoints: "",
  startCity: "",
  weeklyDays: [],
  departureMonths: [],
  seatsPerDeparture: null,
  ...overrides,
});

describe("a package the AI may sell", () => {
  let world: World;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("PackageSelling");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aPackage(changes: Partial<UpdatePackageInput> = {}) {
    counter += 1;
    const name = `Selling ${String(counter)}`;
    const id = await world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title: name,
          startDate: null,
          adults: 2,
          children: 0,
          days: [],
          items: [],
          inclusions: "",
          exclusions: "",
          notes: "",
          taxRateBasisPoints: 500,
          placeOfSupply: null,
        },
        { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") },
      );
      return (await savePackage(tx, world.manager, { quoteId: quote.id, name })).id;
    });
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, { packageId: id, ...words({ name, title: name, ...changes }) }),
    );
    return id;
  }
  const gaps = (id: string) => world.inOrg((tx) => packageSellGaps(tx, id, today));
  const detail = (id: string) =>
    world.inOrg((tx) =>
      getPackage(tx, world.manager, id, {
        photoCount: 0,
        agencyCode: "sharma",
        today: parseCalendarDate("2026-11-10"),
      }),
    );
  const sell = (id: string, sellable: boolean) =>
    world.inOrg((tx) => setPackageSellable(tx, world.manager, { packageId: id, sellable }, today));

  it("saving the package never touches where customers pay, which has its own change and audit", async () => {
    const id = await aPackage();
    const pay = (paymentDetails: string) =>
      world.inOrg((tx) => setPackagePaymentDetails(tx, world.manager, { packageId: id, paymentDetails }));
    await pay("UPI to the agency");
    expect((await detail(id)).paymentDetails).toBe("UPI to the agency");
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, { packageId: id, ...words({ name: "Selling renamed", title: "T" }) }),
    );
    expect((await detail(id)).paymentDetails).toBe("UPI to the agency");
    await pay("UPI to the agency");
    const entries = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: id, action: "package.payment-changed" } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.before).toEqual({ paymentDetailsLength: 0 });
    expect(entries[0]?.after).toEqual({ paymentDetailsLength: 17 });
    expect(JSON.stringify(entries)).not.toContain("UPI to the agency");
  });

  it("the package's own audit keeps its kind, room types, GST switch and advance", async () => {
    const id = await aPackage({ kind: "group", roomTypes: ["double"], advancePerPersonPaise: 100_000 });
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: id,
        ...words({
          name: "Selling audited",
          title: "T",
          kind: "group",
          roomTypes: ["double", "triple"],
          pricesIncludeGst: false,
        }),
      }),
    );
    const last = await world.inOrg((tx) =>
      tx.auditEntry.findFirst({
        where: { entityId: id, action: "quote-package.changed" },
        orderBy: { occurredAt: "desc" },
      }),
    );
    expect(last?.before).toMatchObject({
      kind: "group",
      roomTypes: ["double"],
      pricesIncludeGst: true,
      advancePerPersonPaise: 100_000,
    });
    expect(last?.after).toMatchObject({
      roomTypes: ["double", "triple"],
      pricesIncludeGst: false,
      advancePerPersonPaise: null,
    });
  });

  it("saving group fields keeps them", async () => {
    const id = await aPackage({
      kind: "group",
      roomTypes: ["double", "triple"],
      pricesIncludeGst: false,
      advancePerPersonPaise: 500_000,
      pickupPoints: "Chandigarh ISBT",
      startCity: "Chandigarh",
      weeklyDays: [5, 6],
      departureMonths: [6, 7],
      seatsPerDeparture: 12,
    });
    const saved = await detail(id);
    expect(saved).toMatchObject({
      kind: "group",
      roomTypes: ["double", "triple"],
      pricesIncludeGst: false,
      advancePerPersonPaise: 500_000,
      pickupPoints: "Chandigarh ISBT",
      startCity: "Chandigarh",
      weeklyDays: [5, 6],
      departureMonths: [6, 7],
      seatsPerDeparture: 12,
      sellable: false,
    });
  });

  it("a group package can't be sold until it has room types, prices, an advance and a departure", async () => {
    const id = await aPackage({ kind: "group" });
    expect(await gaps(id)).toEqual(["room_types", "prices", "advance", "departures"]);
    expect((await detail(id)).sellGaps).toEqual(["room_types", "prices", "advance", "departures"]);
    expect(await reasonOf(sell(id, true))).toBe("PACKAGE_NOT_READY_TO_SELL");

    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: id,
        ...words({ name: "Selling group", title: "Selling group", kind: "group", roomTypes: ["double"] }),
      }),
    );
    expect(await gaps(id)).toEqual(["prices", "advance", "departures"]);

    await world.inOrg((tx) =>
      savePackageSeason(tx, world.manager, {
        packageId: id,
        label: "Summer",
        startsOn: "2026-11-01",
        endsOn: "2027-03-31",
        prices: { ...noPrices, double: 2_500_000 },
      }),
    );
    expect(await gaps(id)).toEqual(["advance", "departures"]);

    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: id,
        ...words({
          name: "Selling group",
          title: "Selling group",
          kind: "group",
          roomTypes: ["double"],
          advancePerPersonPaise: 500_000,
        }),
      }),
    );
    expect(await gaps(id)).toEqual(["departures"]);

    // A closed departure, or one already past, does not count; an open one from today does.
    await world.inOrg(async (tx) => {
      const closed = await aDeparture(tx, { startDate: "2026-12-05", endDate: "2026-12-10", status: "closed" });
      const past = await aDeparture(tx, { startDate: "2026-11-01", endDate: "2026-11-05" });
      await tx.departure.updateMany({ where: { id: { in: [closed.id, past.id] } }, data: { templateId: id } });
    });
    expect(await gaps(id)).toEqual(["departures"]);
    await world.inOrg(async (tx) => {
      const open = await aDeparture(tx, { startDate: "2026-12-12", endDate: "2026-12-17" });
      await tx.departure.update({ where: { id: open.id }, data: { templateId: id } });
    });
    expect(await gaps(id)).toEqual([]);

    await sell(id, true);
    expect((await detail(id)).sellable).toBe(true);
  });

  it("counts an open departure's own price as a price", async () => {
    const id = await aPackage({ kind: "group", roomTypes: ["double"], advancePerPersonPaise: 100_000 });
    await world.inOrg(async (tx) => {
      const open = await aDeparture(tx, { startDate: "2026-12-12", endDate: "2026-12-17" });
      await tx.departure.update({ where: { id: open.id }, data: { templateId: id, priceTriplePaise: 100n } });
    });
    expect(await gaps(id)).toEqual(["prices"]);
    await world.inOrg(async (tx) => {
      await tx.departure.updateMany({ where: { templateId: id }, data: { priceDoublePaise: 2_000_000n } });
    });
    expect(await gaps(id)).toEqual([]);
  });

  it("a custom package needs a from price", async () => {
    const id = await aPackage();
    expect(await gaps(id)).toEqual(["from_price"]);
    expect(await reasonOf(sell(id, true))).toBe("PACKAGE_NOT_READY_TO_SELL");
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: id,
        ...words({ name: "Selling custom", title: "Selling custom", priceDisplay: "from", fromPricePaise: 1_800_000 }),
      }),
    );
    expect(await gaps(id)).toEqual([]);
    await sell(id, true);
    expect((await detail(id)).sellable).toBe(true);
  });

  it("sellablePackages offers only what is switched on and still has nothing missing", async () => {
    const ready = await aPackage({ priceDisplay: "from", fromPricePaise: 1_800_000 });
    const off = await aPackage({ priceDisplay: "from", fromPricePaise: 1_800_000 });
    const idsOfSellable = async () => (await world.inOrg((tx) => sellablePackages(tx, today))).map((one) => one.id);
    await sell(ready, true);
    expect(await idsOfSellable()).toContain(ready);
    expect(await idsOfSellable()).not.toContain(off);
    expect((await world.inOrg((tx) => sellablePackages(tx, today))).find((one) => one.id === ready)).toEqual({
      id: ready,
      kind: "custom",
    });
    // The price goes away after the switch was turned on: the switch stays on but the AI is no longer offered it.
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: ready,
        ...words({ name: "Lost price", title: "Lost price", priceDisplay: "on_enquiry", fromPricePaise: null }),
      }),
    );
    expect((await detail(ready)).sellable).toBe(true);
    expect(await idsOfSellable()).not.toContain(ready);
  });

  it("turning selling off always works, and both are audited", async () => {
    const id = await aPackage({ priceDisplay: "from", fromPricePaise: 1_800_000 });
    await sell(id, true);
    // The price goes away: it can still be turned off.
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: id,
        ...words({ name: "Off", title: "Off", priceDisplay: "on_enquiry", fromPricePaise: null }),
      }),
    );
    await sell(id, false);
    expect((await detail(id)).sellable).toBe(false);
    const entries = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { action: "package.sellable-changed", entityId: id }, select: { after: true } }),
    );
    expect(entries.map((entry) => entry.after)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sellable: true }),
        expect.objectContaining({ sellable: false }),
      ]),
    );
    expect(entries).toHaveLength(2);
  });
});
