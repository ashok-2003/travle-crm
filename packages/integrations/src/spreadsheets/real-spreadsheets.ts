// The real spreadsheets adapter: csv-parse and read-excel-file behind the bounded readers, csv-stringify and our own
// streaming .xlsx writer.
import { readCsv } from "./read-csv.js";
import { readXlsx } from "./read-xlsx.js";
import type { Spreadsheets } from "./spreadsheets.js";
import { csvWriter } from "./write-csv.js";
import { xlsxWriter } from "./write-xlsx.js";

export function createSpreadsheets(): Spreadsheets {
  return {
    read: (bytes, limits) =>
      limits.kind === "csv" ? Promise.resolve().then(() => readCsv(bytes, limits)) : readXlsx(bytes, limits),
    writer: ({ kind, sheetName, columns }) => (kind === "csv" ? csvWriter(columns) : xlsxWriter(sheetName, columns)),
  };
}
