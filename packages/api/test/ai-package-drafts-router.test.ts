// ai.packageDrafts on the real router: finding and drafting spend AI calls (ai:suggest and quotes:edit), and saving makes
// the departures only for a member with departures access; a brochure that can't be copied never costs the saved package.
import type { CreateGroupPackageInput } from "@travel-crm/contracts/ai";
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import type { Permission } from "@travel-crm/domain/identity";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

const roomPrices = { single: null, double: 2_499_900, triple: null, quad: null, child_bed: null, child_no_bed: null };

describe("ai.packageDrafts", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const plan: PlanModule[] = ["crm", "quotes", "ai", "departures"];

  it("a member without ai:suggest can't spend a call", async () => {
    const organizationId = await anAgency(harness, { modules: plan });
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    expect(await refusal(caller.ai.packageDrafts.find({}))).toBe("MISSING_PERMISSION");
    expect(
      await refusal(
        caller.ai.packageDrafts.draft({
          fillId: randomUUID(),
          trip: { ref: "t1", name: "Spiti", tokens: ["L1"] },
        }),
      ),
    ).toBe("MISSING_PERMISSION");
  });

  it("a member without quotes:edit can't find trips or save a package", async () => {
    const organizationId = await anAgency(harness, { modules: plan });
    const { caller } = callerOf(harness, { organizationId, granted: ["ai:suggest"] });
    expect(await refusal(caller.ai.packageDrafts.find({}))).toBe("MISSING_PERMISSION");
  });

  async function save(modules: PlanModule[], granted: Permission[], brochureKnowledgeId: string | null = null) {
    const organizationId = await anAgency(harness, { modules });
    const { caller, member } = callerOf(harness, { organizationId, granted });
    const fill = await harness.db.forOrg(organizationId, (tx) =>
      tx.aiFill.create({
        data: {
          target: "package_draft",
          subjectType: "organization",
          subjectId: organizationId,
          requestedBy: member.userId,
          inputKind: "text",
          model: "test",
          proposalHash: "hash",
          fields: ["name"],
          fieldHashes: {},
        },
        select: { id: true },
      }),
    );
    const input: CreateGroupPackageInput = {
      fillId: fill.id,
      name: "Spiti",
      title: "Spiti Valley",
      destinationName: "Spiti",
      nights: 6,
      roomTypes: ["double"],
      weeklyDays: [5],
      departureMonths: [],
      seatsPerDeparture: 10,
      seasons: [{ label: "June", startsOn: "2027-06-01", endsOn: "2027-06-30", prices: roomPrices }],
      pricesIncludeGst: true,
      advancePerPersonPaise: null,
      pickupPoints: "",
      startCity: "",
      inclusions: "",
      exclusions: "",
      cancellationNotes: "",
      summary: "",
      highlights: [],
      days: [],
      brochureKnowledgeId,
      appliedFields: ["name"],
    };
    const result = await caller.ai.packageDrafts.create(input);
    const departures = await harness.db.forOrg(organizationId, (tx) =>
      tx.departure.count({ where: { templateId: result.id } }),
    );
    const saved = await harness.db.forOrg(organizationId, (tx) => tx.quoteTemplate.count({ where: { id: result.id } }));
    return { result, departures, saved };
  }

  it("create makes the departures only with departures access", async () => {
    expect((await save(["crm", "quotes", "ai", "departures"], ["quotes:edit"])).departures).toBe(0);
    expect((await save(["crm", "quotes", "ai"], ["quotes:edit", "departures:create"])).departures).toBe(0);
    const both = await save(["crm", "quotes", "ai", "departures"], ["quotes:edit", "departures:create"]);
    expect(both.departures).toBeGreaterThan(0);
    expect(both.result.brochure).toBe("none");
  });

  it("a brochure that can't be copied leaves the package saved and says failed", async () => {
    const { result, saved } = await save(["crm", "quotes", "ai"], ["quotes:edit"], randomUUID());
    expect(saved).toBe(1);
    expect(result.brochure).toBe("failed");
  });
});
