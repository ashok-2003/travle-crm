// The one-time sheet of passwords (B48): the six columns, a UTF-8 byte-order mark and CRLF line ends, and the formula
// rule of the exports (B40) with the same six cases the spreadsheets adapter is pinned by (D26).
import { describe, expect, it } from "vitest";
import { neutraliseFormula, passwordSheet, passwordSheetText } from "@/organization/staff/import/password-sheet";

describe("the password sheet", () => {
  it("writes the sheet's six columns, formula-safe", () => {
    const text = passwordSheetText(
      [
        { name: "=cmd|' /C calc'!A0", username: "kavita", email: null, password: "h7Kq3mPx9Tzc" },
        { name: 'Imran "Im" Qureshi', username: null, email: "imran@example.test", password: "Rw4bN8tYe2Qa" },
      ],
      "SHARMA",
      "https://app.example.in/sign-in",
    );
    expect(text).toBe(
      [
        '﻿"Name","Username","Email","Temporary password","Organization code","Sign-in page"',
        `"'=cmd|' /C calc'!A0","kavita","","h7Kq3mPx9Tzc","SHARMA","https://app.example.in/sign-in"`,
        '"Imran ""Im"" Qureshi","","imran@example.test","Rw4bN8tYe2Qa","SHARMA","https://app.example.in/sign-in"',
        "",
      ].join("\r\n"),
    );
  });

  it("puts an apostrophe before text starting with =, +, -, @, a tab or a carriage return, as the exports do", () => {
    for (const text of ["=HYPERLINK(1)", "+1", "-1", "@SUM(1)", "\tx", "\rx"]) {
      expect(neutraliseFormula(text)).toBe(`'${text}`);
    }
    for (const text of ["Asha", "'quoted", "1=1", ""]) expect(neutraliseFormula(text)).toBe(text);
  });

  it("is a CSV Blob the browser saves, with nothing but the people given", () => {
    const blob = passwordSheet([{ name: "A", username: "a", email: null, password: "p" }], "SHARMA", "https://x.in");
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(blob.size).toBeGreaterThan(40);
  });
});
