// packages.update makes a group package's departures only for a member who may create departures, on a plan that has them.
import type { UpdatePackageInput } from "@travel-crm/contracts/quotes";
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import type { Permission } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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
  nights: 6,
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
  weeklyDays: [5],
  departureMonths: [],
  seatsPerDeparture: 10,
});

describe("packages.update and departures", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function savedDepartures(modules: PlanModule[], granted: Permission[]) {
    const organizationId = await anAgency(harness, { modules });
    const { caller } = callerOf(harness, { organizationId, granted });
    const pack = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    await caller.packages.update({ packageId: pack.id, ...words("Spiti") });
    return harness.db.forOrg(organizationId, (tx) => tx.departure.count({ where: { templateId: pack.id } }));
  }

  it("makes none for a member without departures:create", async () => {
    expect(await savedDepartures(["crm", "quotes", "departures"], ["quotes:edit"])).toBe(0);
  });

  it("makes none on a plan without the departures module", async () => {
    expect(await savedDepartures(["crm", "quotes"], ["quotes:edit", "departures:create"])).toBe(0);
  });

  it("makes them for a member with departures:create on a plan that has the module", async () => {
    expect(
      await savedDepartures(["crm", "quotes", "departures"], ["quotes:edit", "departures:create"]),
    ).toBeGreaterThan(0);
  });
});

describe("packages.makeGroupQuote", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const call = (modules: PlanModule[], granted: Permission[]) =>
    anAgency(harness, { modules }).then((organizationId) =>
      callerOf(harness, { organizationId, granted }).caller.packages.makeGroupQuote({
        leadId: randomUUID(),
        packageId: randomUUID(),
        departureId: randomUUID(),
        rooms: [{ roomType: "double", people: 2 }],
      }),
    );

  it("needs departures:view as well as quotes:create", async () => {
    expect(await refusal(call(["crm", "quotes", "departures"], ["quotes:create"]))).toBe("MISSING_PERMISSION");
  });

  it("needs the plan's departures module", async () => {
    const reason = await refusal(call(["crm", "quotes"], ["quotes:create", "departures:view"]));
    expect(reason).not.toBe("MISSING_PERMISSION");
    expect(reason).not.toBe("NOT_FOUND");
  });

  it("goes past the checks for a member with both, on a plan with the module", async () => {
    expect(await refusal(call(["crm", "quotes", "departures"], ["quotes:create", "departures:view"]))).toBe(
      "NOT_FOUND",
    );
  });
});
