// An agency's documents as numbered lines for package drafting: every line has a token the AI cites, left-out pieces, parts under
// the budget, and tokens that do not exist dropped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linesAsText, packageSources, partsOf, resolveTokens, type SourcePiece } from "../../src/ai/drafts/sources.js";
import { anAgency, createTestImports, type TestImports } from "../imports/support/test-imports.js";

const piece = (key: string, label: string, lines: string[], number = 1): SourcePiece => ({
  key,
  label,
  kind: "knowledge",
  knowledgeId: null,
  hasFile: false,
  lines: lines.map((text, index) => ({ token: `P${String(number)}.L${String(index + 1)}`, text })),
});

describe("package draft sources", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  it("numbers every line of every source, with its label", async () => {
    const organizationId = await anAgency(test, "Sources agency");
    const pieces = await test.db.forOrg(organizationId, async (tx) => {
      await tx.aiKnowledge.create({
        data: { title: "Spiti brochure", body: "Day 1 Shimla\n\n  \nDay 2 Kalpa\n" + "x".repeat(900) },
      });
      await tx.aiSettings.upsert({
        where: { organizationId },
        create: { instructions: "Always quote in rupees" },
        update: { instructions: "Always quote in rupees" },
      });
      await tx.aiAutopilot.upsert({
        where: { organizationId },
        create: { strictRules: "Never give discounts" },
        update: { strictRules: "Never give discounts" },
      });
      await tx.tripKit.create({
        data: { name: "Kerala", message: "Kerala 5N\nHouseboat", keywords: ["kerala", "alleppey"] },
      });
      return packageSources(tx);
    });
    expect(pieces.map((p) => [p.label, p.kind])).toEqual([
      ["Knowledge: Spiti brochure", "knowledge"],
      ["Instructions", "instructions"],
      ["Strict rules", "strict_rules"],
      ["Trip kit: Kerala", "trip_kit"],
    ]);
    const [knowledge, instructions, rules, kit] = pieces;
    expect(knowledge?.lines.slice(0, 2)).toEqual([
      { token: "P1.L1", text: "Day 1 Shimla" },
      { token: "P1.L2", text: "Day 2 Kalpa" },
    ]);
    expect(knowledge?.lines.map((l) => l.token)).toEqual(["P1.L1", "P1.L2", "P1.L3", "P1.L4", "P1.L5"]);
    expect(knowledge?.lines.map((l) => l.text.length)).toEqual([12, 11, 400, 400, 100]);
    expect(instructions?.lines).toEqual([{ token: "P2.L1", text: "Always quote in rupees" }]);
    expect(rules?.lines).toEqual([{ token: "P3.L1", text: "Never give discounts" }]);
    expect(kit?.lines.map((l) => l.text)).toEqual(["Kerala 5N", "Houseboat", "Keywords: kerala, alleppey"]);
    expect(linesAsText(pieces.slice(1, 2))).toBe("Instructions\n[P2.L1] Always quote in rupees");
  });

  it("leaves out empty and turned-off pieces", async () => {
    const organizationId = await anAgency(test, "Sources empty agency");
    const pieces = await test.db.forOrg(organizationId, async (tx) => {
      await tx.aiKnowledge.create({ data: { title: "Off", body: "hidden", enabled: false } });
      await tx.aiKnowledge.create({ data: { title: "Reading", body: "half", status: "reading" } });
      await tx.aiKnowledge.create({ data: { title: "Blank", body: " \n " } });
      await tx.aiKnowledge.create({ data: { title: "Kept", body: "shown" } });
      await tx.tripKit.create({ data: { name: "Empty kit", message: "", keywords: [] } });
      return packageSources(tx);
    });
    expect(pieces.map((p) => p.label)).toEqual(["Knowledge: Kept"]);
  });

  it("packs whole pieces into parts under the budget, and cuts one piece that is too long by its lines", () => {
    const a = piece("a", "A", ["aaaa", "aaaa"], 1);
    const b = piece("b", "B", ["bbbb", "bbbb"], 2);
    const c = piece("c", "C", ["cccccc", "cccccc", "cccccc"], 3);
    expect(partsOf([a, b], 100)).toHaveLength(1);
    const parts = partsOf([a, b, c], 10);
    expect(parts.map((p) => p.pieces.map((x) => [x.key, x.lines.length]))).toEqual([
      [["a", 2]],
      [["b", 2]],
      [["c", 1]],
      [["c", 1]],
      [["c", 1]],
    ]);
    expect(new Set(parts.map((p) => p.ref)).size).toBe(parts.length);
    expect(parts[2]?.pieces[0]?.lines[0]?.token).toBe("P3.L1");
    expect(parts[3]?.pieces[0]?.lines[0]?.token).toBe("P3.L2");
  });

  it("drops tokens that don't exist", () => {
    const pieces = [piece("a", "Knowledge: A", ["one", "two"], 1)];
    expect(resolveTokens(["P1.L2", "P9.L1", "P1.L2", "nonsense", "P1.L1"], pieces)).toEqual([
      { token: "P1.L2", source: "Knowledge: A", excerpt: "two" },
      { token: "P1.L1", source: "Knowledge: A", excerpt: "one" },
    ]);
  });
});
