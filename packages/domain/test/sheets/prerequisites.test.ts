// The Sheets sync stands on pieces the bulk release built (the plan's N1-N11). Each fails here by its number, so a
// missing piece is named before any sheet code is written; the pieces' own tests prove their behaviour.
import { decideLeadImportInput, leadFileWords } from "@travel-crm/contracts/crm";
import { rowPlans, rowReasonCodes } from "@travel-crm/contracts/imports";
import { describe, expect, it } from "vitest";
import {
  guessFields,
  isAnyImportAdding,
  jobMemberAccess,
  rememberedHeaderFields,
  rememberHeaderFields,
  requestImportAdd,
  startImportFromBytes,
} from "../../src/imports/index.js";
import { columnLetters, nameHeaders } from "@travel-crm/integrations/spreadsheets";

describe("what the Sheets sync needs from earlier branches", () => {
  it("N1: nameHeaders and columnLetters are exported by the spreadsheets port", () => {
    expect(nameHeaders(["Name", "", "Name"])).toEqual(["Name", "Column B", "Name (2)"]);
    expect(columnLetters(27)).toBe("AB");
  });

  it("N2: guessFields reads Google Forms' headers and words in a header, only when asked", () => {
    const headers = ["Timestamp", "Email Address", "Which place?"];
    const on = guessFields("leads", headers, new Map(), { wordsInHeader: true }).map((guess) => guess.field);
    expect(on).toEqual(["enquiry_date", "email", "destination"]);
    const off = guessFields("leads", headers, new Map()).map((guess) => guess.field);
    expect(off[2]).toBeNull();
  });

  it("N3: imports offer startImportFromBytes, isAnyImportAdding, rememberHeaderFields and jobMemberAccess", () => {
    for (const piece of [
      startImportFromBytes,
      isAnyImportAdding,
      rememberedHeaderFields,
      rememberHeaderFields,
      jobMemberAccess,
    ]) {
      expect(typeof piece).toBe("function");
    }
  });

  it("N5 and N8: the contracts know in_crm, its two reasons and addInCrm", () => {
    expect(rowPlans).toContain("in_crm");
    expect(rowReasonCodes).toEqual(expect.arrayContaining(["in_crm_open", "in_crm_closed"]));
    const parsed = decideLeadImportInput.parse({
      importId: "01930000-0000-7000-8000-000000000000",
      addBlocked: false,
      addAlreadyImported: false,
    });
    expect(parsed).toMatchObject({ addInCrm: false });
  });

  it("N9: requestImportAdd takes the hook that runs while the batch is held", () => {
    expect(requestImportAdd.length).toBeGreaterThanOrEqual(5);
  });

  it("N10: Google Sheet is a source in the file words", () => {
    expect(leadFileWords.source.google_sheet).toEqual(["Google Sheet"]);
  });
});
