// How often a sheet's screen asks for it again (S37): every 2 seconds while a check runs or its first rows are being
// read, every 30 otherwise, and the list every 30.
import { describe, expect, it } from "vitest";
import { leadSheetRefetchInterval, sheetListRefetch } from "@/lead-sources/use-lead-sheets";
import { aSheetDetail } from "./records";

describe("leadSheetRefetchInterval", () => {
  it("asks every 2 seconds while a check runs, and while a sheet's rows are first read", () => {
    expect(leadSheetRefetchInterval(aSheetDetail({ checkRunning: true }))).toBe(2000);
    expect(leadSheetRefetchInterval(aSheetDetail({ status: "connecting", step: "done" }))).toBe(2000);
  });

  it("asks every 30 seconds otherwise, and not before the sheet is known", () => {
    expect(leadSheetRefetchInterval(aSheetDetail())).toBe(30_000);
    expect(leadSheetRefetchInterval(aSheetDetail({ status: "connecting", step: "columns" }))).toBe(30_000);
    expect(leadSheetRefetchInterval(undefined)).toBe(false);
    expect(sheetListRefetch).toBe(30_000);
  });
});
