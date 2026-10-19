// The pasted link (S3): a Google Sheets address gives its id and tab, anything else is refused, and only the id and the
// gid are kept.
import { describe, expect, it } from "vitest";
import { beginSheetInput, parseSheetLink, SHEET_LINK_INVALID, sheetLink } from "../../src/sheets/index.js";

const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaa";
const base = `https://docs.google.com/spreadsheets/d/${id}`;

describe("sheetLink", () => {
  it("takes a sheet link and gives its id and tab", () => {
    expect(sheetLink.parse(`${base}/edit?usp=sharing#gid=123`)).toEqual({ spreadsheetId: id, gid: "123" });
    expect(sheetLink.parse(`${base}/edit?gid=7`)).toEqual({ spreadsheetId: id, gid: "7" });
    expect(sheetLink.parse(`${base}/edit#gid=0&range=A1`)).toEqual({ spreadsheetId: id, gid: "0" });
    expect(sheetLink.parse(`${base}/edit`)).toEqual({ spreadsheetId: id, gid: null });
    expect(sheetLink.parse(`  ${base}  `)).toEqual({ spreadsheetId: id, gid: null });
    expect(sheetLink.parse(base)).toEqual({ spreadsheetId: id, gid: null });
    // The address a signed-in browser shows when several Google accounts are open.
    expect(sheetLink.parse(`https://docs.google.com/spreadsheets/u/1/d/${id}/edit#gid=9`)).toEqual({
      spreadsheetId: id,
      gid: "9",
    });
    expect(sheetLink.parse(`${base}/edit#gid=abc`)).toEqual({ spreadsheetId: id, gid: null });
  });

  it("refuses a link that isn't a Google Sheet, with SHEET_LINK_INVALID", () => {
    const refused = [
      "",
      "my sheet",
      `https://drive.google.com/file/d/${id}/view`,
      `https://docs.google.com/document/d/${id}/edit`,
      `http://docs.google.com/spreadsheets/d/${id}/edit`,
      `https://user@docs.google.com/spreadsheets/d/${id}/edit`,
      `https://user:pass@docs.google.com/spreadsheets/d/${id}/edit`,
      `https://docs.google.com:8443/spreadsheets/d/${id}/edit`,
      `https://docs.google.com.evil.test/spreadsheets/d/${id}/edit`,
      `https://docs.google.com@evil.test/spreadsheets/d/${id}/edit`,
      `https://docs.google.com/spreadsheets/d/${"a".repeat(19)}/edit`,
      `https://docs.google.com/spreadsheets/d/${"a".repeat(81)}/edit`,
      `https://docs.google.com/spreadsheets/d/../${id}/edit`,
      `https://docs.google.com/spreadsheets/d/${id}x y/edit`,
      "https://docs.google.com/spreadsheets/d/",
      "https://docs.google.com/spreadsheets/d/" + "a".repeat(2000),
    ];
    for (const link of refused) {
      const result = sheetLink.safeParse(link);
      expect(result.success, link).toBe(false);
      expect(result.error?.issues[0]?.message, link).toBe(SHEET_LINK_INVALID);
    }
  });

  it("never fetches or keeps the rest of the URL", () => {
    const parsed = sheetLink.parse(`${base}/edit?usp=sharing&token=secret#gid=5&other=x`);
    expect(Object.keys(parsed).sort()).toEqual(["gid", "spreadsheetId"]);
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(parseSheetLink(`${base}/edit`)).toEqual({ spreadsheetId: id, gid: null });
    expect(beginSheetInput.parse({ link: `${base}/edit#gid=5` })).toEqual({
      link: { spreadsheetId: id, gid: "5" },
    });
  });
});
