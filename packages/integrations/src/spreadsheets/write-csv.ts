// The CSV writer (B39, B40, D28): UTF-8 with a byte-order mark so Excel shows every script, CRLF line ends, every
// cell quoted, a date as yyyy-mm-dd and a time as yyyy-mm-dd HH:MM, and the formula rule on text and phones alike.
import { stringify } from "csv-stringify/sync";
import { neutraliseFormula } from "./formula-safety.js";
import type { SheetWriter, WriterColumn, WrittenCell } from "./spreadsheets.js";

const byteOrderMark = new Uint8Array([0xef, 0xbb, 0xbf]);

function cellOf(column: WriterColumn, value: WrittenCell): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (column.kind === "date-time") return value.replace("T", " ");
  if (column.kind === "date") return value;
  // In CSV the phone gets the apostrophe too: Excel would read "+91 98765 43210" as a sum (B40).
  return neutraliseFormula(value);
}

export function csvWriter(columns: readonly WriterColumn[]): SheetWriter {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [byteOrderMark];
  const add = (rows: readonly (readonly string[])[]) => {
    chunks.push(
      encoder.encode(stringify(rows as string[][], { quoted: true, quoted_empty: true, record_delimiter: "\r\n" })),
    );
  };
  add([columns.map((column) => neutraliseFormula(column.header))]);
  return {
    write(rows) {
      add(rows.map((cells) => columns.map((column, index) => cellOf(column, cells[index] ?? null))));
    },
    finish() {
      return Promise.resolve(Buffer.concat(chunks));
    },
  };
}
