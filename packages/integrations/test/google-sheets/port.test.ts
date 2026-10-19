// The port is read only (S1): its methods are listed, none writes, and the scope is the readonly one.
import { describe, expect, it } from "vitest";
import {
  createMemoryGoogleSheets,
  GOOGLE_SHEETS_SCOPE,
  googleSheetsMethods,
} from "@travel-crm/integrations/google-sheets";

const controlMethods = [
  "addSpreadsheet",
  "share",
  "unshare",
  "deleteSpreadsheet",
  "append",
  "insertAt",
  "deleteAt",
  "sort",
  "editCell",
  "rename",
  "renameTab",
  "failNext",
  "calls",
];

describe("the Google Sheets port", () => {
  it("has no method that writes", () => {
    expect(googleSheetsMethods).toEqual(["accounts", "describe", "readRows"]);
    const memory = createMemoryGoogleSheets();
    const own = Object.keys(memory).filter((key) => !(googleSheetsMethods as readonly string[]).includes(key));
    expect(own.sort()).toEqual([...controlMethods].sort());
    expect(GOOGLE_SHEETS_SCOPE).toBe("https://www.googleapis.com/auth/spreadsheets.readonly");
  });
});
