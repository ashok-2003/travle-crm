// Reads an .xlsx (B3-B5, D1, D10, D12): the signature first (an old .xls or a protected workbook is a compound file),
// then the bounded pre-inflate, the first sheet's name and size from the workbook's own parts, all read as the reader's
// own parser reads them, and only then read-excel-file on that one sheet.
import { readSheet } from "read-excel-file/node";
import { unpackWorkbook, type UnpackedWorkbook } from "./bounded-unzip.js";
import { cellText, type RawCell } from "./cell-text.js";
import { sheetShaper } from "./sheet-shape.js";
import { type ReadLimits, type ReadSheet, SpreadsheetUnreadableError } from "./spreadsheets.js";
import { readerElementsOf } from "./xml-elements.js";

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

const zipSignature = [0x50, 0x4b, 0x03, 0x04];
const compoundFileSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Office wraps an encrypted workbook in a compound file holding a stream of this name, in UTF-16. */
const encryptedPackage = Buffer.from("EncryptedPackage", "utf16le");

/** The relationship types of a worksheet, in Excel's usual namespace and in Strict Open XML's, as the reader takes. */
const worksheetTypes = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet",
]);

/**
 * The workbook's sheets in its own order, and where the first one's part is, found as read-excel-file finds them: its
 * named `sheet` elements, and the last worksheet relationship with the first one's id. An element whose attributes
 * meet under one name (two ids) is refused: which one the reader keeps depends on its copy of the parser.
 */
function firstSheetOf(unpacked: UnpackedWorkbook) {
  const sheets = readerElementsOf(unpacked.workbook ?? "")?.filter(
    (element) => element.name === "sheet" && Boolean(element.attributes.name),
  );
  const relations = readerElementsOf(unpacked.workbookRelations ?? "")?.filter(
    (element) => element.name === "Relationship",
  );
  const first = sheets?.[0];
  if (sheets === undefined || relations === undefined || first === undefined || first.ambiguous) {
    throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  const relation = relations
    .filter(
      (element) => worksheetTypes.has(element.attributes.Type ?? "") && element.attributes.Id === first.attributes.id,
    )
    .at(-1);
  const target = relation?.attributes.Target;
  if (relation === undefined || relation.ambiguous || target === undefined) {
    throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  }
  const part = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  return { name: first.attributes.name ?? "", count: sheets.length, part };
}

/**
 * Refuses a sheet whose shape alone would make read-excel-file allocate far past the limits: it keeps an array for
 * every row number up to the last, each padded to the widest non-empty column. Twice the rows allows for empty
 * formatted rows; the exact limit is applied to the rows read.
 */
function assertSheetFits(unpacked: UnpackedWorkbook, part: string) {
  const size = unpacked.sheetSizes.get(part);
  if (size === undefined) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  if (size.refusal !== null) throw new SpreadsheetUnreadableError(size.refusal);
}

export async function readXlsx(bytes: Uint8Array, limits: ReadLimits): Promise<ReadSheet> {
  if (startsWith(bytes, compoundFileSignature)) {
    throw new SpreadsheetUnreadableError(Buffer.from(bytes).includes(encryptedPackage) ? "protected" : "old_excel");
  }
  if (!startsWith(bytes, zipSignature)) throw new SpreadsheetUnreadableError("not_a_spreadsheet");
  const unpacked = unpackWorkbook(bytes, { maxRowNumber: limits.maxRows * 2 + 1, maxColumn: limits.maxColumns });
  const sheet = firstSheetOf(unpacked);
  assertSheetFits(unpacked, sheet.part);
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
