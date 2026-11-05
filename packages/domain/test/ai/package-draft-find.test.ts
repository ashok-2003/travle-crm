// Finding the trips in an agency's documents: the AI names each trip with the lines that describe it; code keeps only real lines,
// matches places to existing destinations without creating any, offers parts first when the documents are long, and gives the call back
// when nothing usable came.
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findTrips, saveAiSettings } from "../../src/ai/index.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const NOW = new Date("2026-11-02T06:30:00Z");

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("finding the trips in an agency's documents", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  async function agency(options: { aiOn?: boolean; bodies?: Record<string, string> } = {}) {
    const organizationId = await anAgency(test, "Trips agency");
    const owner = memberOf(organizationId, "org-owner");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    if (options.aiOn !== false) {
      await inOrg((tx) =>
        saveAiSettings(
          tx,
          owner,
          { enabled: true, scoring: true, instructions: "" },
          { providerReady: true, now: NOW },
        ),
      );
    }
    const bodies = options.bodies ?? {
      Manali: "Manali 5 Nights 6 Days\nManali 4 Nights 5 Days",
      Spiti: "Spiti 7 Nights 8 Days",
    };
    await inOrg(async (tx) => {
      for (const [title, body] of Object.entries(bodies)) await tx.aiKnowledge.create({ data: { title, body } });
    });
    const model = createMemoryAiModel();
    const find = (part?: string) => findTrips({ db: test.db, model }, owner, part === undefined ? {} : { part }, NOW);
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { owner, inOrg, model, find, calls };
  }

  const answer = JSON.stringify({
    trips: [
      { name: "Manali 5 Nights 6 Days", place: "Manali", nights: 5, lines: ["P1.L1"] },
      { name: "Manali 4 Nights 5 Days", place: "Manali", nights: 4, lines: ["P1.L2"] },
      { name: "Spiti 7 Nights 8 Days", place: "Spiti", nights: 7, lines: ["P2.L1", "P9.L9"] },
    ],
  });

  it("finds Manali twice and Spiti once, each with its lines, and saves nothing but the fill", async () => {
    const { find, model, inOrg, calls } = await agency();
    model.answer(answer);
    const found = await find();
    expect(found.trips.map((trip) => [trip.name, trip.nights, trip.placeWords])).toEqual([
      ["Manali 5 Nights 6 Days", 5, "Manali"],
      ["Manali 4 Nights 5 Days", 4, "Manali"],
      ["Spiti 7 Nights 8 Days", 7, "Spiti"],
    ]);
    expect(found.trips[2]?.evidence).toEqual([
      { token: "P2.L1", source: "Knowledge: Spiti", excerpt: "Spiti 7 Nights 8 Days" },
    ]);
    expect(new Set(found.trips.map((trip) => trip.ref)).size).toBe(3);
    expect(found.parts).toEqual([]);
    expect(await calls()).toBe(1);
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.feature).toBe("draft_packages");
    const fills = await inOrg((tx) => tx.aiFill.findMany());
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ id: found.fillId, target: "package_draft", subjectType: "organization" });
    expect(await inOrg((tx) => tx.quoteTemplate.count())).toBe(0);
  });

  it("offers the parts first when the documents are too long, and costs nothing until one is chosen", async () => {
    const long = Array.from({ length: 140 }, (_, index) => `Line ${String(index)} ${"x".repeat(300)}`).join("\n");
    const { find, model, calls } = await agency({ bodies: { First: long, Second: long } });
    const offered = await find();
    expect(offered.trips).toEqual([]);
    expect(offered.fillId).toBeNull();
    expect(offered.parts.length).toBeGreaterThan(1);
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toBe(0);
    const ref = offered.parts.at(-1)?.ref ?? "";
    model.answer(JSON.stringify({ trips: [{ name: "Kerala 5N", place: "Kerala", nights: 5, lines: ["P2.L140"] }] }));
    const chosen = await find(ref);
    expect(chosen.readPart).toBe(ref);
    expect(model.requests).toHaveLength(1);
    expect(await calls()).toBe(1);
  });

  it("drops a trip that cites only lines that don't exist", async () => {
    const { find, model } = await agency();
    model.answer(
      JSON.stringify({
        trips: [
          { name: "Ghost 3N", place: "Ghost", nights: 3, lines: ["P7.L7"] },
          { name: "Spiti 7 Nights 8 Days", place: "Spiti", nights: 7, lines: ["P2.L1"] },
        ],
      }),
    );
    const found = await find();
    expect(found.trips.map((trip) => trip.name)).toEqual(["Spiti 7 Nights 8 Days"]);
  });

  it("gives the call back when the AI found nothing", async () => {
    const { find, model, calls, inOrg } = await agency();
    model.answer(JSON.stringify({ trips: [{ name: "Ghost", place: "Ghost", nights: null, lines: ["P8.L8"] }] }));
    expect(await reasonOf(find())).toBe("PACKAGE_DRAFT_NOTHING");
    expect(await calls()).toBe(0);
    expect(await inOrg((tx) => tx.aiFill.count())).toBe(0);
    model.answer("not json at all");
    expect(await reasonOf(find())).toBe("PACKAGE_DRAFT_NOTHING");
    expect(await calls()).toBe(0);
  });

  it("names an existing destination, and creates none", async () => {
    const { find, model, inOrg } = await agency();
    const manali = await inOrg((tx) => tx.destination.create({ data: { name: "Manali" }, select: { id: true } }));
    model.answer(answer);
    const found = await find();
    expect(found.trips.map((trip) => [trip.placeWords, trip.destinationId, trip.destinationName])).toEqual([
      ["Manali", manali.id, "Manali"],
      ["Manali", manali.id, "Manali"],
      ["Spiti", null, null],
    ]);
    expect(await inOrg((tx) => tx.destination.count())).toBe(1);
  });

  it("refuses while the AI is off, asking the model nothing", async () => {
    const { find, model, calls } = await agency({ aiOn: false });
    expect(await reasonOf(find())).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
    expect(await calls()).toBe(0);
  });
});
