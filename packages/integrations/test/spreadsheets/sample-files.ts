// Workbooks built byte by byte for the spreadsheets tests: small ones whose XML each test writes, a zip bomb, a sheet of
// a million rows, and the compound-file headers of an old .xls and a password-protected workbook.
import { Zip, ZipDeflate, strToU8, zipSync } from "fflate";

const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface SampleSheet {
  name: string;
  /** The XML inside <sheetData>: rows and cells as the test writes them. */
  sheetData: string;
  /** XML after </sheetData>, such as <mergeCells>. */
  after?: string;
  /** Where the sheet's part lives, under xl/ (default worksheets/sheet<n>.xml). */
  part?: string;
}

/** A style sheet whose style 1 is Excel's built-in short date (numFmtId 14). */
export const dateStyles =
  `<styleSheet xmlns="${spreadsheetNamespace}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills>` +
  `<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`;

/** The parts of a workbook holding these sheets, in workbook order, with optional styles and shared strings. */
export function workbookParts(
  sheets: readonly SampleSheet[],
  options: { styles?: string; sharedStrings?: readonly string[] } = {},
): Record<string, Uint8Array> {
  const parts: Record<string, string> = {
    "[Content_Types].xml":
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="xml" ContentType="application/xml"/></Types>`,
    "_rels/.rels":
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${relationshipNamespace}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><sheets>` +
      sheets
        .map(
          (sheet, index) =>
            `<sheet name="${sheet.name}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
        )
        .join("") +
      `</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (sheet, index) =>
            `<Relationship Id="rId${String(index + 1)}" Type="${relationshipNamespace}/worksheet" ` +
            `Target="${sheet.part ?? `worksheets/sheet${String(index + 1)}.xml`}"/>`,
        )
        .join("") +
      `</Relationships>`,
  };
  if (options.styles !== undefined) parts["xl/styles.xml"] = options.styles;
  if (options.sharedStrings !== undefined) {
    parts["xl/sharedStrings.xml"] =
      `<sst xmlns="${spreadsheetNamespace}">` +
      options.sharedStrings.map((text) => `<si><t>${text}</t></si>`).join("") +
      `</sst>`;
  }
  sheets.forEach((sheet, index) => {
    parts[`xl/${sheet.part ?? `worksheets/sheet${String(index + 1)}.xml`}`] =
      `<worksheet xmlns="${spreadsheetNamespace}"><sheetData>${sheet.sheetData}</sheetData>${sheet.after ?? ""}</worksheet>`;
  });
  return Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, strToU8(text)]));
}

/** An .xlsx file holding these sheets. */
export function workbookOf(
  sheets: readonly SampleSheet[],
  options: { styles?: string; sharedStrings?: readonly string[] } = {},
): Uint8Array {
  return zipSync(workbookParts(sheets, options));
}

/** An inline-string cell. */
export const textCell = (reference: string, text: string) =>
  `<c r="${reference}" t="inlineStr"><is><t>${text}</t></is></c>`;

/** A numeric cell, with a style when given. */
export const numberCell = (reference: string, value: string, style?: number) =>
  `<c r="${reference}"${style === undefined ? "" : ` s="${String(style)}"`}><v>${value}</v></c>`;

/** A row of cells. */
export const rowOf = (rowNumber: number, cells: string, attributes = "") =>
  `<row r="${String(rowNumber)}"${attributes}>${cells}</row>`;

/** A workbook streamed through fflate, the sheet's XML pushed a chunk at a time so the test never holds it whole. */
function streamedWorkbook(
  sheetChunks: () => Iterable<string>,
  extraParts: Record<string, () => Iterable<string>> = {},
) {
  const chunks: Uint8Array[] = [];
  const state: { failure: Error | null } = { failure: null };
  const zip = new Zip((error, chunk) => {
    if (error) state.failure = error;
    else chunks.push(chunk);
  });
  const add = (name: string, texts: Iterable<string>) => {
    const entry = new ZipDeflate(name, { level: 9 });
    zip.add(entry);
    for (const text of texts) entry.push(strToU8(text));
    entry.push(new Uint8Array(0), true);
  };
  const parts = workbookParts([{ name: "Sheet1", sheetData: "" }]);
  for (const [name, bytes] of Object.entries(parts)) {
    if (name === "xl/worksheets/sheet1.xml") continue;
    const entry = new ZipDeflate(name);
    zip.add(entry);
    entry.push(bytes, true);
  }
  add("xl/worksheets/sheet1.xml", sheetChunks());
  for (const [name, texts] of Object.entries(extraParts)) add(name, texts());
  zip.end();
  if (state.failure) throw state.failure;
  return Buffer.concat(chunks);
}

/** 1 MB of spaces, the zip bomb's filling: it deflates to about a kilobyte. */
const megabyteOfSpaces = " ".repeat(1024 * 1024);

/** A workbook whose XML parts inflate to 120 MB in all, three parts of 40 MB each, from a file of a few hundred KB. */
export function zipBomb(): Buffer {
  function* filler() {
    yield `<worksheet xmlns="${spreadsheetNamespace}"><sheetData>`;
    for (let megabyte = 0; megabyte < 40; megabyte += 1) yield megabyteOfSpaces;
    yield `</sheetData></worksheet>`;
  }
  return streamedWorkbook(filler, { "xl/worksheets/sheet2.xml": filler, "xl/worksheets/sheet3.xml": filler });
}

/** A workbook whose first sheet has a million rows of one number each. */
export function millionRowWorkbook(): Buffer {
  return streamedWorkbook(function* () {
    yield `<worksheet xmlns="${spreadsheetNamespace}"><sheetData>`;
    for (let row = 1; row <= 1_000_000; row += 1)
      yield `<row r="${String(row)}"><c r="A${String(row)}"><v>1</v></c></row>`;
    yield `</sheetData></worksheet>`;
  });
}

/** A compound file's header (an old .xls, or Office's wrapper of an encrypted workbook), with these stream names. */
export function compoundFile(streamNames: readonly string[]): Buffer {
  const signature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const names = streamNames.map((name) => Buffer.from(name, "utf16le"));
  return Buffer.concat([signature, Buffer.alloc(504), ...names, Buffer.alloc(1024)]);
}
