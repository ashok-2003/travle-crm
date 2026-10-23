// A Meta lead becomes the row of a file: questions are columns, answers cells; a name in two halves is one cell, a place
// one note line, a phone loses Meta's "p:", and an answer the form's matches do not list still reaches the note.
import { describe, expect, it } from "vitest";
import { leadAsRow } from "../../src/meta-leads/lead-as-row.js";
import { defaultMatches } from "../../src/meta-leads/question-fields.js";

const matches = defaultMatches([
  { key: "first_name", type: "first_name", label: "First name" },
  { key: "last_name", type: "last_name", label: "Last name" },
  { key: "phone_number", type: "phone", label: "Phone" },
  { key: "city", type: "city", label: "City" },
  { key: "state", type: "state", label: "State" },
  { key: "where_to", type: "custom", label: "Where do you want to go?" },
  { key: "budget_note", type: "custom", label: "Anything else?" },
]);

describe("leadAsRow", () => {
  it("makes one name cell from the two halves, in the form's order", () => {
    const row = leadAsRow(
      { answers: { first_name: ["Asha"], last_name: ["Rao"], phone_number: ["p:+919876543210"] } },
      matches,
    );
    const at = (field: string) => [...row.fieldAt].filter(([, f]) => f === field).map(([i]) => row.cells[i]);
    expect(at("name")).toEqual(["Asha Rao"]);
    expect(at("phone")).toEqual(["+919876543210"]);
    expect(row.phoneGiven).toBe(true);
  });

  it("makes one note cell from city and state, labelled From", () => {
    const row = leadAsRow({ answers: { city: ["Jaipur"], state: ["Rajasthan"] } }, matches);
    const index = row.headers.indexOf("From");
    expect(row.cells[index]).toBe("Jaipur, Rajasthan");
    expect(row.fieldAt.get(index)).toBe("note");
  });

  it("keeps a custom answer under its question, and an unlisted question's answer under its key", () => {
    const row = leadAsRow({ answers: { where_to: ["Spiti"], budget_note: ["Cheap"], new_question: ["Yes"] } }, matches);
    expect(row.cells[row.headers.indexOf("Where do you want to go?")]).toBe("Spiti");
    expect(row.fieldAt.get(row.headers.indexOf("Anything else?"))).toBe("note");
    const extra = row.headers.indexOf("New question");
    expect(row.cells[extra]).toBe("Yes");
    expect(row.fieldAt.get(extra)).toBe("note");
  });

  it("joins a question's several values, and reports no phone when none was given", () => {
    const row = leadAsRow({ answers: { where_to: ["Spiti", "Ladakh"] } }, matches);
    expect(row.cells[row.headers.indexOf("Where do you want to go?")]).toBe("Spiti, Ladakh");
    expect(row.phoneGiven).toBe(false);
  });
});
