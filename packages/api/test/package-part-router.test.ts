// packages.updatePart saves the fields a section names, makes departures as a full save does, and refuses a part that names
// nothing or a member without quotes:edit.
import type { Permission } from "@travel-crm/domain/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("packages.updatePart", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function setUp(granted: Permission[]) {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "departures"] });
    const { caller } = callerOf(harness, { organizationId, granted });
    const pack = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({
        data: { name: "Spiti", title: "Spiti", kind: "group", nights: 6, seatsPerDeparture: 10, summary: "Kept" },
        select: { id: true },
      }),
    );
    return { organizationId, caller, packageId: pack.id };
  }

  it("changing weekly days in a part makes the new departures, as a full save does", async () => {
    const { organizationId, caller, packageId } = await setUp(["quotes:edit", "departures:create"]);
    await caller.packages.updatePart({ packageId, weeklyDays: [5] });
    const row = await harness.db.forOrg(organizationId, async (tx) => ({
      departures: await tx.departure.count({ where: { templateId: packageId } }),
      pack: await tx.quoteTemplate.findUniqueOrThrow({ where: { id: packageId }, select: { summary: true } }),
    }));
    expect(row.departures).toBeGreaterThan(0);
    expect(row.pack.summary).toBe("Kept");
  });

  it("a part naming no field is refused with 400", async () => {
    const { caller, packageId } = await setUp(["quotes:edit"]);
    expect(await refusal(caller.packages.updatePart({ packageId }))).toBe("BAD_REQUEST");
  });

  it("refuses a member without quotes:edit", async () => {
    const { caller, packageId } = await setUp(["quotes:view"]);
    expect(await refusal(caller.packages.updatePart({ packageId, summary: "x" }))).toBe("MISSING_PERMISSION");
  });
});
