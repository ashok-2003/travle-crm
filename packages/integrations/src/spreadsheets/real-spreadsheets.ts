// The real spreadsheets adapter: csv-parse and read-excel-file behind the bounded readers, an .xlsx read in a thread
// of its own, csv-stringify and our own streaming .xlsx writer.
import { readCsv } from "./read-csv.js";
import { defaultXlsxThreadOptions, readXlsxInThread, type XlsxThreadOptions } from "./read-xlsx-in-thread.js";
import type { Spreadsheets } from "./spreadsheets.js";
import { csvWriter } from "./write-csv.js";
import { xlsxWriter } from "./write-xlsx.js";

/** The .xlsx thread's module and time, for tests (and the api's bundle test) only. */
export function createSpreadsheets(options: { xlsxThread?: Partial<XlsxThreadOptions> } = {}): Spreadsheets {
  const xlsxThread = { ...defaultXlsxThreadOptions, ...options.xlsxThread };
  return {
    read: (bytes, limits) =>
      limits.kind === "csv"
        ? Promise.resolve().then(() => readCsv(bytes, limits))
        : readXlsxInThread(bytes, limits, xlsxThread),
    writer: ({ kind, sheetName, columns }) => (kind === "csv" ? csvWriter(columns) : xlsxWriter(sheetName, columns)),
  };
}

/**
 * Reads a one-cell workbook back, for the worker's start-up (ADR 0030): a deploy whose .xlsx thread can't run (its
 * module missing beside the bundle) refuses to start, rather than failing every import of an .xlsx.
 */
export async function checkXlsxReading(spreadsheets: Spreadsheets): Promise<void> {
  const writer = spreadsheets.writer({ kind: "xlsx", sheetName: "Check", columns: [{ header: "Name", kind: "text" }] });
  writer.write([["Asha"]]);
  const limits = { kind: "xlsx", maxRows: 1, maxColumns: 1, maxCellLength: 10 } as const;
  const sheet = await spreadsheets.read(await writer.finish(), limits);
  if (sheet.rows[0]?.cells[0] !== "Asha") throw new Error("The .xlsx reader read its start-up check wrongly");
}
