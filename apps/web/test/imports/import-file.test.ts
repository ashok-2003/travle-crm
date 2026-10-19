// @vitest-environment node
// What an import's file must be before it is sent (spec B2): .xlsx or .csv by its extension, whatever type the
// browser reports (Windows calls a CSV application/vnd.ms-excel), not empty, at most 10 MB, with a name storage keeps;
// an old .xls or a Numbers file is told how to save itself.
import { describe, expect, it } from "vitest";
import { checkImportFile } from "@/imports/import-file";

const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (name: string, type = "", size = 100) => ({ name, type, size });

describe("checkImportFile", () => {
  it("takes .xlsx and .csv by their extension, CSV even when Windows calls it application/vnd.ms-excel", () => {
    expect(checkImportFile(file("enquiries-oct-2026.xlsx", xlsx))).toEqual({ ok: true, contentType: xlsx });
    expect(checkImportFile(file("Leads.XLSX"))).toEqual({ ok: true, contentType: xlsx });
    expect(checkImportFile(file("leads.csv", "application/vnd.ms-excel"))).toEqual({
      ok: true,
      contentType: "text/csv",
    });
    expect(checkImportFile(file("leads.csv", "text/plain"))).toEqual({ ok: true, contentType: "text/csv" });
    expect(checkImportFile(file("leads.pdf", "application/pdf"))).toEqual({ ok: false, problem: "type" });
    expect(checkImportFile(file("leads", "text/csv"))).toEqual({ ok: false, problem: "type" });
    expect(checkImportFile(file("leads.csv", "text/csv", 0))).toEqual({ ok: false, problem: "empty" });
    expect(checkImportFile(file("leads.csv", "text/csv", 10 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      problem: "size",
    });
    expect(checkImportFile(file("leads.csv", "text/csv", 10 * 1024 * 1024))).toEqual({
      ok: true,
      contentType: "text/csv",
    });
    expect(checkImportFile(file("lea‮ds.csv"))).toEqual({ ok: false, problem: "name" });
  });

  it("says to save an .xls or .numbers file as .xlsx or CSV", () => {
    expect(checkImportFile(file("old-notebook.xls", "application/vnd.ms-excel"))).toEqual({
      ok: false,
      problem: "old",
    });
    expect(checkImportFile(file("Leads.numbers"))).toEqual({ ok: false, problem: "old" });
  });
});
