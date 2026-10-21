// Our streaming .xlsx writer (spec 6.1, B39, B40): one sheet of values, each batch of rows deflated into the sheet's
// zip entry as it comes, so the writer holds only the compressed output. Text is inline, numbers are numbers, dates
// are Excel's serial days in a date style, and no cell is ever a formula.
import { Zip, ZipDeflate, strToU8 } from "fflate";
import { neutraliseFormula } from "./formula-safety.js";
import { columnLetters } from "./sheet-shape.js";
import type { SheetWriter, WriterColumn, WrittenCell } from "./spreadsheets.js";
import {
  dateStyle,
  dateTimeStyle,
  escapeXml,
  fixedParts,
  headerStyle,
  sheetEnd,
  sheetPartName,
  sheetStart,
} from "./xlsx-parts.js";

const dayMilliseconds = 86_400_000;
/** Excel's day 0, as its serial days count (1900's false leap day included). */
const excelEpoch = Date.UTC(1899, 11, 30);

/** "yyyy-mm-dd" or "yyyy-mm-ddTHH:MM" as Excel's serial days, or null when it isn't one. */
export function serialDays(text: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (parts === null) return null;
  const [, year, month, day, hours = "0", minutes = "0"] = parts;
  const days = (Date.UTC(Number(year), Number(month) - 1, Number(day)) - excelEpoch) / dayMilliseconds;
  return (days * 1440 + Number(hours) * 60 + Number(minutes)) / 1440;
}

/** What a formatted phone number looks like: digits and spaces after an optional +, nothing a formula could be. */
const phoneShape = /^\+?[\d ]+$/;

/** Space at either end, or a line break, needs xml:space; leaving it off elsewhere keeps 50,000 rows under 50 MB. */
const needsPreserve = /^\s|\s$|[\n\r]/;

const textCell = (reference: string, text: string, style = "") =>
  `<c r="${reference}"${style} t="inlineStr"><is>` +
  `<t${needsPreserve.test(text) ? ' xml:space="preserve"' : ""}>${escapeXml(text)}</t></is></c>`;

function cellXml(column: WriterColumn, reference: string, value: WrittenCell): string {
  if (value === null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${reference}"><v>${String(value)}</v></c>` : "";
  if (column.kind === "date" || column.kind === "date-time") {
    const serial = serialDays(value);
    const style = column.kind === "date" ? dateStyle : dateTimeStyle;
    if (serial !== null) return `<c r="${reference}" s="${String(style)}"><v>${String(serial)}</v></c>`;
  }
  // A phone our own code wrote from a valid number stays "+91 98765 43210" (B40's exception); anything else in a phone
  // column is text like any other (D10).
  return textCell(reference, column.kind === "phone" && phoneShape.test(value) ? value : neutraliseFormula(value));
}

export function xlsxWriter(sheetName: string, columns: readonly WriterColumn[]): SheetWriter {
  const chunks: Uint8Array[] = [];
  // An object, not a variable: the callback sets it, and TypeScript narrows a variable only callbacks change to null.
  const state: { failure: Error | null } = { failure: null };
  const zip = new Zip((error, chunk) => {
    if (error) state.failure = error;
    else chunks.push(chunk);
  });
  for (const [name, text] of Object.entries(fixedParts(sheetName))) {
    const part = new ZipDeflate(name, { level: 6 });
    zip.add(part);
    part.push(strToU8(text), true);
  }
  const sheet = new ZipDeflate(sheetPartName, { level: 6 });
  zip.add(sheet);
  const letters = columns.map((_, index) => columnLetters(index));
  const header = columns
    .map((column, index) =>
      textCell(`${letters[index] ?? ""}1`, neutraliseFormula(column.header), ` s="${String(headerStyle)}"`),
    )
    .join("");
  sheet.push(strToU8(`${sheetStart}<row r="1">${header}</row>`));
  let rowNumber = 1;

  return {
    write(rows) {
      const xml = rows.map((cells) => {
        rowNumber += 1;
        const row = String(rowNumber);
        const cellsXml = columns.map((column, index) =>
          cellXml(column, `${letters[index] ?? ""}${row}`, cells[index] ?? null),
        );
        return `<row r="${row}">${cellsXml.join("")}</row>`;
      });
      sheet.push(strToU8(xml.join("")));
    },
    finish() {
      sheet.push(strToU8(sheetEnd), true);
      zip.end();
      // The callbacks have all run by now: ZipDeflate and Zip work synchronously.
      return state.failure === null ? Promise.resolve(Buffer.concat(chunks)) : Promise.reject(state.failure);
    },
  };
}
