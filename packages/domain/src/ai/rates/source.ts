// What a rate sheet says, as numbered lines the AI reads and staff are shown beside the rows (design 3.2): an Excel file through the
// spreadsheets port (cell by cell, with its tab and row), a PDF through its text (with its page). A sheet too big for one read is
// divided into parts, a tab or a few pages each, and staff choose which to read next. Photos have no lines: they go to the model as
// pictures. Code makes the lines, so the words shown beside a row are the sheet's own, never the model's copy of them.
import { RATE_SHEET_CHARACTERS } from "@travel-crm/contracts/ai";
import { documentPages } from "@travel-crm/integrations/ai";
import {
  columnLetters,
  SpreadsheetUnreadableError,
  type ReadSheet,
  type Spreadsheets,
} from "@travel-crm/integrations/spreadsheets";
import { refuse } from "../refusals.js";

/** A part is read with at most this many lines, whatever their length. */
const LINES_PER_PART = 150;
const LINE_CHARACTERS = 300;
const TABS_MAX = 12;
const PAGES_MAX = 60;
const ROWS_PER_TAB_MAX = 3000;

export interface SourceLine {
  /** "L12": how the AI names it. */
  token: string;
  /** The cells or words of the line. */
  text: string;
  /** Where it is, as staff are told: "Rates, row 14", "Page 2". */
  source: string;
}

export interface SheetPart {
  label: string;
  lines: SourceLine[];
}

interface Raw {
  /** The row or page it is on, which a part's label names it by. */
  position: number;
  text: string;
  source: string;
}

/** Whole lines into parts of at most the characters and lines one read takes. */
function divide(raws: readonly Raw[]): Raw[][] {
  const parts: Raw[][] = [];
  let current: Raw[] = [];
  let size = 0;
  for (const raw of raws) {
    if (current.length > 0 && (size + raw.text.length > RATE_SHEET_CHARACTERS || current.length >= LINES_PER_PART)) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(raw);
    size += raw.text.length;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

const numbered = (raws: readonly Raw[]): SourceLine[] =>
  raws.map((raw, index) => ({ token: `L${String(index + 1)}`, text: raw.text, source: raw.source }));

function cellLine(cells: readonly (string | null)[]): string {
  return cells
    .flatMap((cell, index) => (cell === null ? [] : [`${columnLetters(index)}: ${cell}`]))
    .join(" | ")
    .slice(0, LINE_CHARACTERS);
}

/** A workbook's tabs read one by one, the empty ones skipped. */
async function readTabs(spreadsheets: Spreadsheets, bytes: Uint8Array): Promise<ReadSheet[]> {
  const sheets: ReadSheet[] = [];
  // Known once a tab has been read: the first may be empty.
  let count: number | null = null;
  for (let number = 1; number <= TABS_MAX && (count === null || number <= count); number += 1) {
    try {
      const sheet = await spreadsheets.read(bytes, {
        kind: "xlsx",
        maxRows: ROWS_PER_TAB_MAX,
        maxColumns: 30,
        maxCellLength: LINE_CHARACTERS,
        sheetNumber: number,
      });
      count = sheet.sheetCount;
      sheets.push(sheet);
    } catch (error) {
      if (!(error instanceof SpreadsheetUnreadableError)) throw error;
      // A tab with nothing on it is passed over.
      if (error.reason === "no_rows" || error.reason === "no_column_names") continue;
      // Past the last tab, when the first was empty and the count unknown.
      if (count === null && number > 1 && error.reason === "not_a_spreadsheet") break;
      throw error.reason === "too_many_rows" || error.reason === "too_large_unpacked"
        ? refuse("RATE_SHEET_TOO_BIG", "This sheet is too big to read", "VALIDATION")
        : refuse("RATE_SHEET_UNREADABLE", "This file can't be read as an Excel sheet", "VALIDATION");
    }
  }
  return sheets;
}

export async function excelParts(spreadsheets: Spreadsheets, bytes: Uint8Array): Promise<SheetPart[]> {
  const tabs = await readTabs(spreadsheets, bytes);
  if (tabs.length === 0) throw refuse("RATE_SHEET_UNREADABLE", "There is nothing on this sheet to read", "VALIDATION");
  return tabs.flatMap((sheet) => {
    const name = sheet.sheetName ?? "Sheet";
    const raw = (rowNumber: number, cells: readonly (string | null)[]): Raw => ({
      position: rowNumber,
      text: cellLine(cells),
      source: `${name}, row ${String(rowNumber)}`,
    });
    const rows = [
      // A blank header cell was named by its letter; that is not on the sheet.
      raw(
        sheet.headerRowNumber,
        sheet.header.map((cell) => (/^Column [A-Z]{1,2}$/.test(cell) ? null : cell)),
      ),
      ...sheet.rows.map((row) => raw(row.rowNumber, row.cells)),
    ].filter((row) => row.text !== "");
    const pieces = divide(rows);
    return pieces.map((piece) => ({
      label:
        pieces.length === 1
          ? name
          : `${name}, rows ${String(piece[0]?.position ?? 0)}-${String(piece.at(-1)?.position ?? 0)}`,
      lines: numbered(piece),
    }));
  });
}

export async function pdfParts(bytes: Uint8Array): Promise<SheetPart[]> {
  let pages: string[] | null;
  try {
    pages = await documentPages(bytes, "application/pdf", 20_000);
  } catch {
    throw refuse("RATE_SHEET_UNREADABLE", "This PDF can't be read", "VALIDATION");
  }
  if (pages === null || pages.every((page) => page === "")) {
    // A scan has no words to copy: the same sheet as photos can be read.
    throw refuse(
      "RATE_SHEET_SCANNED",
      "This PDF has no text to read: upload photos of its pages instead",
      "VALIDATION",
    );
  }
  if (pages.length > PAGES_MAX) throw refuse("RATE_SHEET_TOO_BIG", "This sheet is too big to read", "VALIDATION");
  const raws: Raw[] = pages.flatMap((page, pageIndex) =>
    page
      .split("\n")
      .map((line) => line.trim().slice(0, LINE_CHARACTERS))
      .filter((line) => line !== "")
      .map((line) => ({ position: pageIndex + 1, text: line, source: `Page ${String(pageIndex + 1)}` })),
  );
  const labels = new Map<string, number>();
  return divide(raws).map((piece) => {
    const first = piece[0]?.position ?? 1;
    const last = piece.at(-1)?.position ?? first;
    const base = first === last ? `Page ${String(first)}` : `Pages ${String(first)}-${String(last)}`;
    const seen = (labels.get(base) ?? 0) + 1;
    labels.set(base, seen);
    return { label: seen === 1 ? base : `${base} (${String(seen)})`, lines: numbered(piece) };
  });
}
