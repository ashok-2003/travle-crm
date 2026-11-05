// ai.packageDrafts on the real router: AI calls need ai:suggest and quotes:edit, and saving makes departures and the brochure.
import type { CreateGroupPackageInput } from "@travel-crm/contracts/ai";
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import type { Permission } from "@travel-crm/domain/identity";
import type { Files } from "@travel-crm/domain/files";
import { saveAiSettings } from "@travel-crm/domain/ai";
import type { Context } from "../src/context.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type CallerOptions, type Harness } from "./forms-support.js";

const roomPrices = { single: null, double: 2_499_900, triple: null, quad: null, child_bed: null, child_no_bed: null };

/** A scripted AI model: answers the queued texts in order (the api package does not depend on the integrations package). */
function scriptedModel(configured = true) {
  const answers: string[] = [];
  const model: NonNullable<Context["ai"]> = {
    configured,
    complete: () =>
      Promise.resolve(
        answers.length === 0
          ? { ok: false, reason: "not_configured" }
          : { ok: true, text: answers.shift() ?? "", model: "test-model", inputTokens: 0, outputTokens: 0 },
      ),
  };
  return { model, answer: (text: string) => answers.push(text) };
}

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

  async function save(
    modules: PlanModule[],
    granted: Permission[],
    brochureKnowledgeId: string | null = null,
    context: CallerOptions["context"] = {},
    existingOrganizationId?: string,
  ) {
    const organizationId = existingOrganizationId ?? (await anAgency(harness, { modules }));
    const { caller, member } = callerOf(harness, { organizationId, granted, context });
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

  it("says attached when the brochure copy works", async () => {
    const copied: unknown[][] = [];
    const files = {
      list: () => Promise.resolve([]),
      copyFile: (...args: unknown[]) => Promise.resolve(copied.push(args)),
    } as unknown as Files;
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "ai"] });
    const piece = await harness.db.forOrg(organizationId, (tx) =>
      tx.aiKnowledge.create({
        data: { title: "Brochure", body: "Spiti", attachmentId: randomUUID() },
        select: { id: true },
      }),
    );
    const { result } = await save(["crm", "quotes", "ai"], ["quotes:edit"], piece.id, { files }, organizationId);
    expect(result.brochure).toBe("attached");
    expect(copied).toHaveLength(1);
  });

  describe("find and draft", () => {
    async function agencyWithModel() {
      const organizationId = await anAgency(harness, { modules: plan });
      const model = scriptedModel();
      const { caller, member } = callerOf(harness, { organizationId, context: { ai: model.model } });
      await harness.db.forOrg(organizationId, async (tx) => {
        await saveAiSettings(
          tx,
          member,
          { enabled: true, scoring: true, instructions: "" },
          { providerReady: true, now: new Date() },
        );
        await tx.aiKnowledge.create({ data: { title: "Spiti", body: "Spiti 7 Nights 8 Days" } });
      });
      return { caller, model };
    }

    it("finds a trip, then drafts it with its evidence", async () => {
      const { caller, model } = await agencyWithModel();
      model.answer(JSON.stringify({ trips: [{ name: "Spiti 7N", place: "Spiti", nights: 7, lines: ["P1.L1"] }] }));
      const found = await caller.ai.packageDrafts.find({});
      expect(found.trips.map((trip) => trip.name)).toEqual(["Spiti 7N"]);
      const trip = found.trips[0];
      if (trip === undefined || found.fillId === null) throw new Error("no trip found");
      model.answer(JSON.stringify({ name: { value: "Spiti 7N", tokens: ["P1.L1"] } }));
      const draft = await caller.ai.packageDrafts.draft({
        fillId: found.fillId,
        trip: { ref: trip.ref, name: trip.name, tokens: trip.evidence.map((line) => line.token) },
      });
      expect(draft.name.value).toBe("Spiti 7N");
      expect(draft.name.evidence[0]?.excerpt).toBe("Spiti 7 Nights 8 Days");
    });

    it("refuses with AI_NOT_READY when the model has no key", async () => {
      const organizationId = await anAgency(harness, { modules: plan });
      const { caller } = callerOf(harness, {
        organizationId,
        context: { ai: scriptedModel(false).model },
      });
      expect(await refusal(caller.ai.packageDrafts.find({}))).toBe("AI_NOT_READY");
    });
  });
});
