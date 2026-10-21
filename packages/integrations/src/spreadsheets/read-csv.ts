// Reads a CSV (B3, D11): UTF-8 with or without a byte-order mark, UTF-16 with one, else Windows-1252; the delimiter
// the first record uses most; one row per record, so a quoted line break keeps Excel's numbering.
import { parse } from "csv-parse/sync";
import { cellText } from "./cell-text.js";
import { sheetShaper } from "./sheet-shape.js";
import { type ReadLimits, type ReadSheet, SpreadsheetUnreadableError } from "./spreadsheets.js";

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const candidates = [",", ";", "\t"] as const;

/** The delimiter used most outside quotes in the first record; a comma on a tie or when there is none. */
export function delimiterOf(text: string): string {
  const counts = new Map<string, number>(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && (character === "\n" || character === "\r")) break;
    else if (!quoted && counts.has(character)) counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let best = ",";
  for (const candidate of candidates) if ((counts.get(candidate) ?? 0) > (counts.get(best) ?? 0)) best = candidate;
  return best;
}

export function readCsv(bytes: Uint8Array, limits: ReadLimits): ReadSheet {
  const text = decode(bytes);
  // No text file holds a NUL: this is a binary file (a workbook, a PDF) given a .csv name.
  if (text.includes("\u0000")) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const shaper = sheetShaper(limits, { sheetName: null, sheetCount: 1 });
  let rowNumber = 0;
  try {
    parse(text, {
      delimiter: delimiterOf(text),
      relax_column_count: true,
      relax_quotes: true,
      // Each record goes to the shaper as it is parsed, so the parser keeps none and a row past the limit stops it.
      on_record: (record: string[]) => {
        rowNumber += 1;
        shaper.add({ rowNumber, cells: record.map((cell) => cellText(cell, limits.maxCellLength)) });
        return null;
      },
    });
  } catch (error) {
    if (error instanceof SpreadsheetUnreadableError) throw error;
    // A quote never closed, or anything else the parser can't make records of.
    throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  return shaper.finish();
}
