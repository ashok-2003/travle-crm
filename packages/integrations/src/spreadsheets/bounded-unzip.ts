// The workbook's bounded pre-inflate (B4, D12): every XML part read-excel-file would inflate goes through fflate's Unzip
// against a running total, before the reader sees the file. It keeps the workbook's two small parts and, for each
// sheet, what the reader would allocate: its rows, its last row number and its last non-empty column.
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { SpreadsheetUnreadableError } from "./spreadsheets.js";

/** The most XML a workbook may inflate to, all parts together. */
export const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

/** Each push of compressed bytes inflates to at most about a thousand times its size (DEFLATE's limit). */
const PUSH_BYTES = 4096;

/** The parts read-excel-file unpacks: the same filter, so the bound covers exactly what it will inflate. */
const isXmlPart = (name: string) => name.endsWith(".xml") || name.endsWith(".xml.rels");

/** What a sheet's part makes read-excel-file allocate: a row for every row number, a cell up to the widest. */
export interface SheetPartSize {
  rowElements: number;
  lastRowNumber: number;
  /** The last column (1-based) holding a cell that isn't self-closing, so not empty. */
  lastColumn: number;
}

export interface UnpackedWorkbook {
  /** The text of xl/workbook.xml and xl/_rels/workbook.xml.rels, when the file has them. */
  workbook: string | null;
  workbookRelations: string | null;
  sheetSizes: ReadonlyMap<string, SheetPartSize>;
}

/** A column's 1-based number from its letters: A is 1, Z 26, AA 27. */
function columnNumber(letters: string): number {
  let number = 0;
  for (let index = 0; index < letters.length; index += 1) number = number * 26 + letters.charCodeAt(index) - 64;
  return number;
}

/** Counts a sheet part's rows and cells as its XML streams past, a chunk at a time, keeping only an unfinished tag. */
function sheetSizer() {
  const size: SheetPartSize = { rowElements: 0, lastRowNumber: 0, lastColumn: 0 };
  const decoder = new TextDecoder();
  let rest = "";
  const tag = /<(?:[\w.-]+:)?(row|c)\b([^>]*)>/g;
  const consume = (text: string) => {
    tag.lastIndex = 0;
    for (let match = tag.exec(text); match !== null; match = tag.exec(text)) {
      const attributes = match[2] ?? "";
      if (match[1] === "row") {
        size.rowElements += 1;
        const number = /\br="(\d+)"/.exec(attributes)?.[1];
        size.lastRowNumber = Math.max(size.lastRowNumber, number === undefined ? size.rowElements : Number(number));
      } else {
        const reference = /\br="([A-Z]{1,3})(\d+)"/.exec(attributes);
        if (reference !== null) {
          size.lastRowNumber = Math.max(size.lastRowNumber, Number(reference[2]));
          if (!attributes.trimEnd().endsWith("/"))
            size.lastColumn = Math.max(size.lastColumn, columnNumber(reference[1] ?? ""));
        }
      }
    }
    // Only a tag the chunk cut off carries over to the next one.
    const open = text.lastIndexOf("<");
    rest = open !== -1 && !text.includes(">", open) ? text.slice(open) : "";
    // A tag longer than this is no spreadsheet's.
    if (rest.length > 65_536) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  };
  return {
    size,
    push(chunk: Uint8Array, final: boolean) {
      consume(rest + decoder.decode(chunk, { stream: !final }));
    },
  };
}

const keptParts = new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);

export function unpackWorkbook(bytes: Uint8Array): UnpackedWorkbook {
  let unpacked = 0;
  // An object, not a variable: the callbacks set it, and TypeScript narrows a variable only callbacks change to null.
  const state: { failure: SpreadsheetUnreadableError | null } = { failure: null };
  const kept = new Map<string, string>();
  const sheetSizes = new Map<string, SheetPartSize>();
  const fail = (file: UnzipFile, reason: SpreadsheetUnreadableError["reason"]) => {
    state.failure ??= new SpreadsheetUnreadableError(reason);
    file.terminate();
  };
  const unzip = new Unzip((file) => {
    if (!isXmlPart(file.name)) return;
    if (file.compression !== 0 && file.compression !== 8) {
      fail(file, "not_a_spreadsheet");
      return;
    }
    const keep = keptParts.has(file.name);
    const keptChunks: Uint8Array[] = [];
    const sizer = file.name.startsWith("xl/worksheets/") ? sheetSizer() : null;
    if (sizer !== null) sheetSizes.set(file.name, sizer.size);
    file.ondata = (error, chunk, final) => {
      if (state.failure !== null) return;
      if (error !== null) {
        fail(file, "not_a_spreadsheet");
        return;
      }
      unpacked += chunk.byteLength;
      if (unpacked > MAX_UNPACKED_BYTES) {
        fail(file, "too_large_unpacked");
        return;
      }
      try {
        sizer?.push(chunk, final);
      } catch (caught) {
        if (!(caught instanceof SpreadsheetUnreadableError)) throw caught;
        fail(file, caught.reason);
        return;
      }
      if (keep) keptChunks.push(chunk);
      if (keep && final) kept.set(file.name, Buffer.concat(keptChunks).toString("utf8"));
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.byteLength && state.failure === null; offset += PUSH_BYTES) {
      unzip.push(bytes.subarray(offset, offset + PUSH_BYTES), offset + PUSH_BYTES >= bytes.byteLength);
    }
  } catch {
    // fflate throws on a broken archive's structure (its entries' contents report through ondata).
    state.failure ??= new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  if (state.failure !== null) throw state.failure;
  return {
    workbook: kept.get("xl/workbook.xml") ?? null,
    workbookRelations: kept.get("xl/_rels/workbook.xml.rels") ?? null,
    sheetSizes,
  };
}
