// Packages (release 7b) against the real database, under row-level security: a package's words and address (unique among
// live packages), publishing that needs a name, an address, a summary and a photo, tiers of priced lines, and quotes made from
// them: each tier a quote of its own priced from the season that covers the start date, a line with no rate left at zero and
// marked, costs kept for the agency whoever asks, and the "From" helper that suggests a price and changes nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { createBookingFromQuote } from "../../src/bookings/index.js";
import {
  calculateFromPrice,
  getPackage,
  getQuote,
  listPackages,
  makeQuotesFromPackage,
  removeTier,
  saveTier,
  savePackage,
  saveQuoteSettings,
  setPackagePublished,
  tiersOf,
  updatePackage,
  createQuote,
} from "../../src/quotes/index.js";
import { createSupplier, saveRate, saveSeason } from "../../src/suppliers/index.js";
import { aLead } from "../crm/support/records.js";
import { openWorld, type World } from "../bookings/support.js";
import type { TierLine, UpdatePackageInput } from "@travel-crm/contracts/quotes";

const context = { supplierStateCode: "27", now: new Date("2026-11-10T06:00:00Z") };
const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );
const words = (overrides: Partial<UpdatePackageInput> = {}): Omit<UpdatePackageInput, "packageId"> => ({
  name: "Kedarnath yatra",
  title: "Kedarnath yatra",
  days: [{ title: "Arrive", description: "" }],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  slug: "kedarnath-yatra",
  destinationId: null,
  nights: 5,
  summary: "Five days to Kedarnath.",
  highlights: ["Darshan"],
  priceDisplay: "on_enquiry",
  fromPricePaise: null,
  defaultTravellerLevel: null,
  cancellationNotes: "",
  kind: "custom",
  roomTypes: [],
  pricesIncludeGst: true,
  advancePerPersonPaise: null,
  paymentDetails: "",
  pickupPoints: "",
  startCity: "",
  weeklyDays: [],
  departureMonths: [],
  seatsPerDeparture: null,
  ...overrides,
});
const line = (overrides: Partial<TierLine> = {}): TierLine => ({
  description: "Cab",
  detail: "",
  rateId: null,
  quantityRule: "fixed",
  quantity: 1,
  unitPricePaise: 1_800_000,
  ...overrides,
});

describe("packages and the quotes made from them", () => {
  let world: World;
  let deluxe: string;
  let suite: string;
  let counter = 0;
  beforeAll(async () => {
    world = await openWorld("Packages");
    const supplier = await world.inOrg((tx) =>
      createSupplier(tx, world.manager, {
        kind: "hotel",
        name: "Hotel Aurora",
        city: "",
        gstin: "",
        paymentTerms: "",
        paymentDetails: "",
        notes: "",
      }),
    );
    const season = await world.inOrg((tx) =>
      saveSeason(tx, world.manager, {
        supplierId: supplier.id,
        label: "Peak",
        startsOn: "2026-12-01",
        endsOn: "2027-01-15",
      }),
    );
    const rate = (item: string, costPaise: number) =>
      world.inOrg((tx) =>
        saveRate(tx, world.manager, {
          seasonId: season.id,
          item,
          mealPlan: "MAP",
          occupancy: "double",
          unit: "per_room_night",
          costPaise,
          note: "",
        }),
      );
    deluxe = (await rate("Deluxe room", 350_000)).id;
    suite = (await rate("Suite", 600_000)).id;
    await world.inOrg((tx) =>
      saveQuoteSettings(tx, world.manager, {
        upiId: "",
        upiName: "",
        defaultTaxRateBasisPoints: 500,
        defaultTerms: "",
        defaultMarkupBasisPoints: 0,
        minMarginBasisPoints: null,
        minMarginPerPersonPaise: null,
      }),
    );
  });
  afterAll(async () => {
    await world.close();
  });

  /** A package kept from a quote, as the product makes one, with its words. */
  async function aPackage(changes: Partial<UpdatePackageInput> = {}) {
    counter += 1;
    const name = `Package ${String(counter)}`;
    const made = await world.inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        world.manager,
        {
          leadId: lead.id,
          title: `${name} trip`,
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
        context,
      );
      return savePackage(tx, world.manager, { quoteId: quote.id, name });
    });
    await world.inOrg((tx) =>
      updatePackage(tx, world.manager, {
        packageId: made.id,
        ...words({ name, title: name, slug: `package-${String(counter)}`, ...changes }),
      }),
    );
    return made.id;
  }
  const detail = (packageId: string, photoCount = 0) =>
    world.inOrg((tx) =>
      getPackage(tx, world.manager, packageId, {
        photoCount,
        agencyCode: "sharma",
        today: parseCalendarDate("2026-11-10"),
      }),
    );
  const lead = () => world.inOrg((tx) => aLead(tx, { ownerUserId: world.seller.userId, stage: "contacted" }));

  describe("its words and its page", () => {
    it("keeps an address to one live package, and a name too", async () => {
      const first = await aPackage({ slug: "spiti-winter" });
      const firstName = (await detail(first)).name;
      const second = await aPackage();
      expect(
        await reasonOf(
          world.inOrg((tx) =>
            updatePackage(tx, world.manager, { packageId: second, ...words({ slug: "spiti-winter" }) }),
          ),
        ),
      ).toBe("PACKAGE_SLUG_TAKEN");
      expect(
        await reasonOf(
          world.inOrg((tx) =>
            updatePackage(tx, world.manager, {
              packageId: second,
              ...words({ name: firstName, slug: "other" }),
            }),
          ),
        ),
      ).toBe("PACKAGE_NAME_TAKEN");
    });

    it("needs a price to show a price, and a known destination", async () => {
      const id = await aPackage();
      expect(
        await reasonOf(
          world.inOrg((tx) => updatePackage(tx, world.manager, { packageId: id, ...words({ priceDisplay: "from" }) })),
        ),
      ).toBe("FROM_PRICE_REQUIRED");
      expect(
        await reasonOf(
          world.inOrg((tx) =>
            updatePackage(tx, world.manager, {
              packageId: id,
              ...words({ destinationId: "00000000-0000-4000-8000-000000000000" }),
            }),
          ),
        ),
      ).toBe("NOT_FOUND");
    });

    it("is published only with a name, an address, a summary and a photo", async () => {
      const id = await aPackage({ slug: null, summary: "" });
      expect((await detail(id, 0)).gaps).toEqual(["slug", "summary", "photo"]);
      expect(
        await reasonOf(
          world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId: id, published: true }, 1)),
        ),
      ).toBe("PACKAGE_NOT_READY");
      await world.inOrg((tx) =>
        updatePackage(tx, world.manager, { packageId: id, ...words({ slug: `ready-${String(counter)}` }) }),
      );
      expect(
        await reasonOf(
          world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId: id, published: true }, 0)),
        ),
      ).toBe("PACKAGE_NOT_READY");
      await world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId: id, published: true }, 1));
      expect((await detail(id, 1)).published).toBe(true);
      // A published page keeps its address.
      expect(
        await reasonOf(
          world.inOrg((tx) => updatePackage(tx, world.manager, { packageId: id, ...words({ slug: null }) })),
        ),
      ).toBe("PACKAGE_PUBLISHED_NEEDS_SLUG");
      await world.inOrg((tx) => setPackagePublished(tx, world.manager, { packageId: id, published: false }, 1));
      const audit = await world.inOrg((tx) =>
        tx.auditEntry.findMany({
          where: { entityId: id, action: { startsWith: "quote-package." } },
          select: { action: true },
        }),
      );
      expect(audit.map((entry) => entry.action)).toEqual(
        expect.arrayContaining(["quote-package.published", "quote-package.unpublished"]),
      );
    });

    it("lists its address, its page and how many tiers it has", async () => {
      const id = await aPackage();
      await world.inOrg((tx) => saveTier(tx, world.manager, { packageId: id, name: "Standard", lines: [line()] }));
      const listed = (await world.inOrg((tx) => listPackages(tx))).find((one) => one.id === id);
      expect(listed).toMatchObject({ tierCount: 1, published: false });
      expect(listed?.slug).toMatch(/^package-/);
    });
  });

  describe("its tiers", () => {
    it("holds five tiers with a name each, and names the rate a line prices from", async () => {
      const id = await aPackage();
      const saved = await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Standard",
          lines: [line({ rateId: deluxe, unitPricePaise: 0 })],
        }),
      );
      expect(
        await reasonOf(
          world.inOrg((tx) => saveTier(tx, world.manager, { packageId: id, name: "Standard", lines: [] })),
        ),
      ).toBe("TIER_NAME_TAKEN");
      const tiers = await world.inOrg((tx) => tiersOf(tx, id));
      expect(tiers[0]?.lines[0]?.rateLabel).toBe("Hotel Aurora: Deluxe room");
      for (const name of ["B", "C", "D", "E"]) {
        await world.inOrg((tx) => saveTier(tx, world.manager, { packageId: id, name, lines: [] }));
      }
      expect(
        await reasonOf(world.inOrg((tx) => saveTier(tx, world.manager, { packageId: id, name: "F", lines: [] }))),
      ).toBe("PACKAGE_TIER_LIMIT");
      await world.inOrg((tx) => removeTier(tx, world.manager, saved.id));
      expect((await world.inOrg((tx) => tiersOf(tx, id))).map((tier) => tier.name)).not.toContain("Standard");
    });
  });

  describe("quotes made from it", () => {
    async function twoTiers() {
      const id = await aPackage({
        cancellationNotes: "Free to cancel 30 days before.",
        defaultTravellerLevel: "detailed",
      });
      const standard = await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Standard",
          lines: [
            line({ description: "Hotel", rateId: deluxe, quantityRule: "per_room_night", unitPricePaise: 0 }),
            line({ description: "Cab" }),
          ],
        }),
      );
      const better = await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Deluxe",
          lines: [
            line({ description: "Hotel", rateId: suite, quantityRule: "per_room_night", unitPricePaise: 0 }),
            line(),
          ],
        }),
      );
      return { id, standard: standard.id, better: better.id };
    }

    it("makes a quote for each tier chosen, priced from the season of the start date, with the cost kept", async () => {
      const { id, standard, better } = await twoTiers();
      const forLead = await lead();
      const made = await world.inOrg((tx) =>
        makeQuotesFromPackage(
          tx,
          world.seller,
          { leadId: forLead.id, packageId: id, tierIds: [standard, better], startDate: "2026-12-10" },
          context,
        ),
      );
      expect(made.quotes.map((quote) => quote.title)).toEqual([
        `${(await detail(id)).title} (Standard)`,
        `${(await detail(id)).title} (Deluxe)`,
      ]);
      expect(made.quotes.map((quote) => quote.needsRateLines)).toEqual([0, 0]);
      // The seller reads no cost; the manager does, and the margin is on the lines that have one.
      const first = made.quotes[0];
      const read = await world.inOrg((tx) => getQuote(tx, world.manager, first?.id ?? ""));
      // Two adults: one room, five nights.
      expect(read.items[0]).toMatchObject({ quantity: 5, unitPricePaise: 350_000, costUnitPaise: 350_000 });
      expect(read.items[1]).toMatchObject({ quantity: 1, unitPricePaise: 1_800_000 });
      expect(read.items[1]?.costUnitPaise).toBeUndefined();
      expect(read.startDate).toBe("2026-12-10");
      expect(read.notes).toContain("Cancellation: Free to cancel 30 days before.");
      const bySeller = await world.inOrg((tx) => getQuote(tx, world.seller, first?.id ?? ""));
      expect(bySeller.items[0]).not.toHaveProperty("costUnitPaise");
      const stored = await world.inOrg((tx) => tx.quote.findUniqueOrThrow({ where: { id: first?.id ?? "" } }));
      expect(stored.templateId).toBe(id);
    });

    it("leaves a line at zero that needs a rate when the date is in no season, and invents nothing", async () => {
      const { id, standard } = await twoTiers();
      const forLead = await lead();
      const made = await world.inOrg((tx) =>
        makeQuotesFromPackage(
          tx,
          world.seller,
          { leadId: forLead.id, packageId: id, tierIds: [standard], startDate: "2027-06-01" },
          context,
        ),
      );
      const first = made.quotes[0];
      expect(first?.needsRateLines).toBe(1);
      const read = await world.inOrg((tx) => getQuote(tx, world.manager, first?.id ?? ""));
      expect(read.items[0]).toMatchObject({ unitPricePaise: 0, needsRate: true });
      expect(read.items[0]?.costUnitPaise).toBeUndefined();
      // With no start date no rate line can be priced either.
      const undated = await world.inOrg((tx) =>
        makeQuotesFromPackage(
          tx,
          world.seller,
          { leadId: forLead.id, packageId: id, tierIds: [standard], startDate: null },
          context,
        ),
      );
      expect(undated.quotes[0]?.needsRateLines).toBe(1);
    });

    it("needs a tier chosen from a package that has some, and one of its own", async () => {
      const { id } = await twoTiers();
      const forLead = await lead();
      expect(
        await reasonOf(
          world.inOrg((tx) =>
            makeQuotesFromPackage(
              tx,
              world.seller,
              { leadId: forLead.id, packageId: id, tierIds: [], startDate: null },
              context,
            ),
          ),
        ),
      ).toBe("PACKAGE_TIER_REQUIRED");
      expect(
        await reasonOf(
          world.inOrg((tx) =>
            makeQuotesFromPackage(
              tx,
              world.seller,
              { leadId: forLead.id, packageId: id, tierIds: ["00000000-0000-4000-8000-000000000000"], startDate: null },
              context,
            ),
          ),
        ),
      ).toBe("NOT_FOUND");
    });

    it("makes one quote from a package with no tiers, from the lines it was saved with", async () => {
      const id = await aPackage();
      const forLead = await lead();
      const made = await world.inOrg((tx) =>
        makeQuotesFromPackage(
          tx,
          world.seller,
          { leadId: forLead.id, packageId: id, tierIds: [], startDate: null },
          context,
        ),
      );
      expect(made.quotes).toHaveLength(1);
    });

    it("makes a booking at the traveller level the package asks for", async () => {
      const { id, standard } = await twoTiers();
      const forLead = await lead();
      const made = await world.inOrg((tx) =>
        makeQuotesFromPackage(
          tx,
          world.seller,
          { leadId: forLead.id, packageId: id, tierIds: [standard], startDate: "2026-12-10" },
          context,
        ),
      );
      const quoteId = made.quotes[0]?.id ?? "";
      await world.inOrg((tx) =>
        tx.quote.update({
          where: { id: quoteId },
          data: { status: "accepted", acceptedAt: context.now, acceptedName: "Rahul" },
        }),
      );
      const bookingId = await world.inOrg((tx) =>
        createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId, confirmed: false }, context.now),
      );
      const booking = await world.inOrg((tx) => tx.booking.findUniqueOrThrow({ where: { id: bookingId ?? "" } }));
      expect(booking.level).toBe("detailed");
    });
  });

  describe("the 'From' helper", () => {
    it("suggests the cheapest tier for two adults on the first day some tier prices, and saves nothing", async () => {
      const id = await aPackage();
      await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Standard",
          lines: [
            line({ description: "Hotel", rateId: deluxe, quantityRule: "per_room_night", unitPricePaise: 0 }),
            line(),
          ],
        }),
      );
      await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Deluxe",
          lines: [
            line({ description: "Hotel", rateId: suite, quantityRule: "per_room_night", unitPricePaise: 0 }),
            line(),
          ],
        }),
      );
      // From before the Peak season begins, the first day any tier prices is Peak's first.
      const suggested = await world.inOrg((tx) => calculateFromPrice(tx, id, parseCalendarDate("2026-11-10")));
      // Standard: 5 room nights at ₹3,500 and the cab ₹18,000 = ₹35,500 for two: ₹17,750 each.
      expect(suggested).toEqual({ fromPricePaise: 1_775_000, tierName: "Standard", forDate: "2026-12-01" });
      expect((await detail(id)).fromPricePaise).toBeNull();
    });

    it("suggests nothing when no tier prices completely", async () => {
      const id = await aPackage();
      await world.inOrg((tx) =>
        saveTier(tx, world.manager, {
          packageId: id,
          name: "Standard",
          lines: [line({ rateId: deluxe, quantityRule: "per_room_night", unitPricePaise: 0 })],
        }),
      );
      expect(await world.inOrg((tx) => calculateFromPrice(tx, id, parseCalendarDate("2027-03-01")))).toEqual({
        fromPricePaise: null,
        tierName: null,
        forDate: null,
      });
      const empty = await aPackage();
      expect(
        (await world.inOrg((tx) => calculateFromPrice(tx, empty, parseCalendarDate("2026-11-10")))).fromPricePaise,
      ).toBeNull();
    });
  });
});
