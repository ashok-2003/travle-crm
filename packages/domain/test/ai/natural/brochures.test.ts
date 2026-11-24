// The one agent's brochure labels and lines, from trip sheets: B1 on in order, the trip's title for a nameless one.
import { describe, expect, it } from "vitest";
import { brochureLabelsOf, brochuresBlock, sentBrochuresLine } from "../../../src/ai/natural/trips/brochures.js";
import type { TripSheet } from "../../../src/ai/natural/types.js";

const sheet = (label: string, title: string, brochures: TripSheet["brochures"]) =>
  ({ label, packageId: `p-${label}`, title, brochures, photoIds: [], fileIds: [] }) as unknown as TripSheet;

const sheets = [
  sheet("T1", "Snow Lake Trek", [
    { attachmentId: "a1", name: "Full itinerary", description: "Day plan\nand costs <b>" },
    { attachmentId: "a2", name: null, description: null },
  ]),
  sheet("T2", "Spiti Loop", [{ attachmentId: "a3", name: "Spiti PDF", description: "All about Spiti" }]),
];

describe("the one agent's brochures", () => {
  it("labels brochures B1 on in the sheets' order, the same every time", () => {
    const ids = (from: readonly TripSheet[]) => [...brochureLabelsOf(from).values()].map((one) => one.attachmentId);
    expect(ids(sheets)).toEqual(["a1", "a2", "a3"]);
    expect([...brochureLabelsOf(sheets).keys()]).toEqual(["B1", "B2", "B3"]);
    expect(ids(sheets)).toEqual(ids(sheets));
  });

  it("names an undescribed brochure by its trip's title and says it has no description yet", () => {
    expect(brochureLabelsOf(sheets).get("B2")).toMatchObject({ name: "Snow Lake Trek", description: null });
    expect(brochuresBlock(sheets)).toContain(
      "Brochure ID: B2\nTrip: T1 Snow Lake Trek\nName: Snow Lake Trek\nAbout: no description yet",
    );
  });

  it("writes one labelled entry a brochure, the owner's words fenced in one line, and keeps the IDs from the customer", () => {
    const lines = (brochuresBlock(sheets) ?? "").split("\n");
    expect(lines.slice(0, 7)).toEqual([
      "## Brochures",
      "Each brochure's ID (B1, B2…) is for send_brochure only: never write it to the customer.",
      "",
      "Brochure ID: B1",
      "Trip: T1 Snow Lake Trek",
      "Name: Full itinerary",
      "About: Day plan and costs ‹b›",
    ]);
    expect(lines.filter((line) => line.startsWith("Brochure ID:"))).toHaveLength(3);
  });

  it("reads an empty description as none", () => {
    const empty = [sheet("T1", "A", [{ attachmentId: "e1", name: "Plan", description: "" }])];
    expect(brochuresBlock(empty)).toContain("Name: Plan\nAbout: no description yet");
  });

  it("has no block with no brochures", () => {
    expect(brochuresBlock([sheet("T1", "A", [])])).toBeNull();
  });

  it("lists the brochures sent in this chat", () => {
    expect(sentBrochuresLine(sheets, ["a2", "a3", "other"])).toBe(
      "Brochures sent in this chat: B2 Snow Lake Trek; B3 Spiti PDF.",
    );
    expect(sentBrochuresLine(sheets, ["other"])).toBeNull();
  });
});
