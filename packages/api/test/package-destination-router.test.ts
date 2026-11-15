// packages.update with a new destination's name (the package editor's 'Add "Spiti"'): it needs quotes:edit like every
// package change, adds the destination once, and refuses a name sent beside a destination's id.
import type { UpdatePackageInput } from "@travel-crm/contracts/quotes";
import type { Permission } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

const words = (name: string): Omit<UpdatePackageInput, "packageId"> => ({
  name,
  title: name,
  days: [],
  inclusions: "",
  exclusions: "",
  notes: "",
  taxRateBasisPoints: 500,
  slug: null,
  destinationId: null,
  nights: null,
  summary: "",
  highlights: [],
  priceDisplay: "on_enquiry",
  fromPricePaise: null,
  defaultTravellerLevel: null,
  cancellationNotes: "",
  kind: "group",
  roomTypes: [],
  pricesIncludeGst: true,
  advancePerPersonPaise: null,
  pickupPoints: "",
  startCity: "",
  weeklyDays: [],
  departureMonths: [],
  seatsPerDeparture: null,
});

describe("packages.update with a new destination", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  /** Saves a new package as a member holding these permissions; gives the refusal and the destinations named Spiti. */
  async function save(granted: Permission[], changes: Partial<UpdatePackageInput>) {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { caller } = callerOf(harness, { organizationId, granted });
    const pack = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    const outcome = await refusal(caller.packages.update({ packageId: pack.id, ...words("Spiti"), ...changes }));
    const destinations = await harness.db.forOrg(organizationId, (tx) =>
      tx.destination.findMany({ select: { id: true, name: true } }),
    );
    const saved = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.findUniqueOrThrow({ where: { id: pack.id }, select: { destinationId: true } }),
    );
    return { outcome, destinations, destinationId: saved.destinationId };
  }

  it("is refused without quotes:edit, and adds nothing", async () => {
    const result = await save(["leads:view", "leads:edit"], { newDestinationName: "Spiti" });
    expect(result.outcome).toBe("MISSING_PERMISSION");
    expect(result.destinations).toEqual([]);
  });

  it("adds the destination and sets it on the package for a member with quotes:edit", async () => {
    const result = await save(["quotes:edit"], { newDestinationName: " Spiti " });
    expect(result.outcome).toBe("accepted");
    expect(result.destinations).toEqual([{ id: result.destinationId, name: "Spiti" }]);
  });

  it("refuses a new name sent beside a destination's id", async () => {
    const result = await save(["quotes:edit"], {
      destinationId: "00000000-0000-4000-8000-000000000000",
      newDestinationName: "Spiti",
    });
    expect(result.outcome).toBe("BAD_REQUEST");
    expect(result.destinations).toEqual([]);
  });
});
