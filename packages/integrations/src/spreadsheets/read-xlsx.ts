// Reads an .xlsx (B3-B5, D10, D12): the signature first (an old .xls or a protected workbook is a compound file), then
// the bounded pre-inflate, the first sheet's name and size from the workbook's own parts, and only then read-excel-file
// on that one sheet.
import { readSheet } from "read-excel-file/node";
import { unpackWorkbook, type UnpackedWorkbook } from "./bounded-unzip.js";
import { cellText, type RawCell } from "./cell-text.js";
import { sheetShaper } from "./sheet-shape.js";
import { type ReadLimits, type ReadSheet, SpreadsheetUnreadableError } from "./spreadsheets.js";

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

const zipSignature = [0x50, 0x4b, 0x03, 0x04];
const compoundFileSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Office wraps an encrypted workbook in a compound file holding a stream of this name, in UTF-16. */
const encryptedPackage = Buffer.from("EncryptedPackage", "utf16le");

const decodeXml = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, "&");

/** An attribute's value, under any namespace prefix: read-excel-file drops them, so `ns:id` is `r:id`. */
const attributeOf = (tag: string, name: string) => {
  const value = new RegExp(`\\s(?:[\\w.-]+:)?${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? null : decodeXml(value);
};

/** The workbook's sheets in its own order, and where the first one's part is, as read-excel-file resolves it. */
function firstSheetOf(unpacked: UnpackedWorkbook) {
  if (unpacked.workbook === null || unpacked.workbookRelations === null) {
    throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  const sheets = unpacked.workbook.match(/<(?:[\w.-]+:)?sheet\s[^>]*>/g) ?? [];
  const first = sheets[0];
  const relationId = first === undefined ? null : attributeOf(first, "id");
  if (first === undefined || relationId === null) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const relation = (unpacked.workbookRelations.match(/<(?:[\w.-]+:)?Relationship\s[^>]*>/g) ?? []).find(
    (tag) => attributeOf(tag, "Id") === relationId,
  );
  const target = relation === undefined ? null : attributeOf(relation, "Target");
  if (target === null) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const part = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return { name: attributeOf(first, "name") ?? "", count: sheets.length, part };
}

/**
 * Refuses a sheet whose shape alone would make read-excel-file allocate far past the limits: it keeps an array for
 * every row number up to the last, each padded to the widest non-empty column. Twice the rows allows for empty
 * formatted rows; the exact limit is applied to the rows read.
 */
function assertSheetFits(unpacked: UnpackedWorkbook, part: string, limits: ReadLimits) {
  const size = unpacked.sheetSizes.get(part);
  if (size === undefined) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  if (Math.max(size.rowElements, size.lastRowNumber) > limits.maxRows * 2 + 1) {
    throw new SpreadsheetUnreadableError("too_many_rows");
  }
  if (size.lastColumn > limits.maxColumns) throw new SpreadsheetUnreadableError("too_many_columns");
}

export async function readXlsx(bytes: Uint8Array, limits: ReadLimits): Promise<ReadSheet> {
  if (startsWith(bytes, compoundFileSignature)) {
    throw new SpreadsheetUnreadableError(Buffer.from(bytes).includes(encryptedPackage) ? "protected" : "old_excel");
  }
  if (!startsWith(bytes, zipSignature)) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const unpacked = unpackWorkbook(bytes);
  const sheet = firstSheetOf(unpacked);
  assertSheetFits(unpacked, sheet.part, limits);
  let data: unknown;
  try {
    data = await readSheet(Buffer.from(bytes), 1);
  } catch {
    // InvalidInputError, InvalidSpreadsheetError, SheetNotFoundError: a zip that isn't a workbook read-excel-file knows.
    throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  if (!Array.isArray(data)) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const shaper = sheetShaper(limits, { sheetName: sheet.name, sheetCount: sheet.count });
  (data as RawCell[][]).forEach((cells, index) => {
    shaper.add({ rowNumber: index + 1, cells: cells.map((cell) => cellText(cell, limits.maxCellLength)) });
  });
  return shaper.finish();
}
