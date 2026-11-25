// The price table, the departure calendar and the quick departure writes each refuse a member without their permission.
import type { Permission } from "@travel-crm/domain/identity";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

describe("trip page routers", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function caller(granted: Permission[]) {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "departures"] });
    return callerOf(harness, { organizationId, granted }).caller;
  }

  it("packages.savePriceTable needs quotes:edit", async () => {
    const view = await caller(["quotes:view"]);
    const input = {
      packageId: randomUUID(),
      roomTypes: ["double" as const],
      columns: [{ seasonIds: [randomUUID()], label: "Regular", prices: { ...none, double: 100 } }],
    };
    expect(await refusal(view.packages.savePriceTable(input))).toBe("MISSING_PERMISSION");
  });

  it("departures.calendar needs departures:view", async () => {
    const nobody = await caller(["quotes:view"]);
    expect(
      await refusal(nobody.departures.calendar({ packageId: randomUUID(), from: "2026-12-01", to: "2026-12-10" })),
    ).toBe("MISSING_PERMISSION");
  });

  it("departures.setSeats and setPrices need departures:edit", async () => {
    const viewer = await caller(["departures:view"]);
    expect(await refusal(viewer.departures.setSeats({ departureId: randomUUID(), seatsTotal: 5 }))).toBe(
      "MISSING_PERMISSION",
    );
    expect(await refusal(viewer.departures.setPrices({ departureId: randomUUID(), prices: none }))).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("departures.calendar reads for a viewer", async () => {
    const viewer = await caller(["departures:view"]);
    expect(
      await refusal(viewer.departures.calendar({ packageId: randomUUID(), from: "2026-12-01", to: "2026-12-10" })),
    ).toBe("NOT_FOUND");
  });
});
