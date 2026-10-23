// A form's questions get default fields: Meta's standard types for the person, custom questions by their wording, the rest
// in the note; a field goes to one question only; the checklist asks for a name and a contact.
import { describe, expect, it } from "vitest";
import { checklistOf, defaultMatches } from "../../src/meta-leads/question-fields.js";

const q = (key: string, type: Parameters<typeof defaultMatches>[0][number]["type"], label: string) => ({
  key,
  type,
  label,
});

describe("defaultMatches", () => {
  it("matches the standard types for the person and keeps city, state and ZIP for the note", () => {
    const matches = defaultMatches([
      q("full_name", "full_name", "Full name"),
      q("email", "email", "Email"),
      q("phone_number", "phone", "Phone"),
      q("city", "city", "City"),
    ]);
    expect(matches.map((m) => [m.key, m.field, m.guessedBy])).toEqual([
      ["full_name", "name", "standard"],
      ["email", "email", "standard"],
      ["phone_number", "phone", "standard"],
      ["city", "note", "standard"],
    ]);
  });

  it("guesses a custom question from its label, and sends an unplaced one to the note", () => {
    const matches = defaultMatches([
      q("where", "custom", "Where do you want to go?"),
      q("people", "custom", "How many people?"),
      q("anything", "custom", "Anything else we should know?"),
    ]);
    expect(matches.map((m) => m.field)).toEqual(["destination", "note", "note"]);
    expect(matches[0]?.guessedBy).toBe("label");
    expect(matches[2]?.guessedBy).toBeNull();
  });

  it("gives a field to one question only: a custom question that guesses what the form already has goes to the note", () => {
    const matches = defaultMatches([
      q("full_name", "full_name", "Full name"),
      q("your_name", "custom", "Your name please"),
      q("mobile", "custom", "Your mobile"),
      q("phone_number", "phone", "Phone"),
    ]);
    expect(matches.map((m) => m.field)).toEqual(["name", "note", "note", "phone"]);
  });

  it("joins first and last name into the name field", () => {
    const matches = defaultMatches([
      q("first_name", "first_name", "First name"),
      q("last_name", "last_name", "Last name"),
    ]);
    expect(matches.map((m) => m.field)).toEqual(["name", "name"]);
  });

  it("never gives a question the stage", () => {
    const matches = defaultMatches([q("status", "custom", "Status")]);
    expect(matches[0]?.field).toBe("note");
  });
});

describe("checklistOf", () => {
  it("asks for a name and a phone, an email or an Instagram handle", () => {
    expect(checklistOf([{ field: "name" }, { field: "phone" }])).toEqual({ hasName: true, hasContact: true });
    expect(checklistOf([{ field: "name" }, { field: "email" }])).toEqual({ hasName: true, hasContact: true });
    expect(checklistOf([{ field: "name" }, { field: "note" }])).toEqual({ hasName: true, hasContact: false });
    expect(checklistOf([{ field: "phone" }, { field: null }])).toEqual({ hasName: false, hasContact: true });
  });
});
