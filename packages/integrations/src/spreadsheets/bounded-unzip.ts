// The workbook's bounded pre-inflate (B4, D1, D12): every XML part read-excel-file would inflate goes through fflate's
// Unzip against a running total, before the reader sees the file. It keeps the workbook's two small parts and sizes
// every part as the reader would read it (sheet-sizer.ts), so whichever part is the first sheet is known to fit.
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { type SheetPartSize, sheetSizer } from "./sheet-sizer.js";
import { SpreadsheetUnreadableError } from "./spreadsheets.js";

/** The most XML a workbook may inflate to, all parts together. */
export const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

/** Each push of compressed bytes inflates to at most about a thousand times its size (DEFLATE's limit). */
const PUSH_BYTES = 4096;

/** The parts read-excel-file unpacks: the same filter, so the bound covers exactly what it will inflate. */
const isXmlPart = (name: string) => name.endsWith(".xml") || name.endsWith(".xml.rels");

export interface UnpackedWorkbook {
  /** The text of xl/workbook.xml and xl/_rels/workbook.xml.rels, when the file has them. */
  workbook: string | null;
  workbookRelations: string | null;
  /** Every XML part's size as the reader would read it, by the part's name. */
  sheetSizes: ReadonlyMap<string, SheetPartSize>;
}

const keptParts = new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);

export function unpackWorkbook(
  bytes: Uint8Array,
  limits: { maxRowNumber: number; maxColumn: number },
): UnpackedWorkbook {
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
    // Which copy of a part twice in the archive the reader takes is its unzipper's business: no workbook has one.
    if (sheetSizes.has(file.name)) {
      fail(file, "not_a_spreadsheet");
      return;
    }
    const keep = keptParts.has(file.name);
    const keptChunks: Uint8Array[] = [];
    const sizer = sheetSizer(limits);
    sheetSizes.set(file.name, sizer.size);
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
      sizer.push(chunk, final);
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
