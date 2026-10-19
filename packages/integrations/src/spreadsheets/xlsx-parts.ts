// The fixed parts of a one-sheet .xlsx (B39): the package's content types and relations, the workbook, and a style
// sheet with a bold header (style 1), dates as "d mmm yyyy" (2) and times as "d mmm yyyy h:mm AM/PM" (3).

const spreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const headerStyle = 1;
export const dateStyle = 2;
export const dateTimeStyle = 3;

/** XML 1.0 allows no control character but tab, line feed and carriage return, nor U+FFFE, U+FFFF or a lone surrogate. */
const keptControls = new Set(["\t", "\n", "\r"]);

export function escapeXml(text: string): string {
  return (
    text
      .toWellFormed()
      .replace(/\p{Cc}/gu, (control) => (keptControls.has(control) ? control : ""))
      .replace(/[\ufffe\uffff]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // A parser reads a raw carriage return as a line feed; the reference keeps it.
      .replace(/\r/g, "&#13;")
  );
}

/** A sheet name Excel accepts: at most 31 characters, none of []:*?/\ and no apostrophe at either end. */
function sheetNameOf(name: string): string {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/^'+|'+$/g, "")
    .slice(0, 31)
    .trim();
  return cleaned === "" ? "Sheet1" : cleaned;
}

export const sheetPartName = "xl/worksheets/sheet1.xml";

export function fixedParts(sheetName: string): Record<string, string> {
  return {
    "[Content_Types].xml":
      declaration +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`,
    "_rels/.rels":
      declaration +
      `<Relationships xmlns="${packageRelationships}">` +
      `<Relationship Id="rId1" Type="${relationshipNamespace}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    "xl/workbook.xml":
      declaration +
      `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}">` +
      `<sheets><sheet name="${escapeXml(sheetNameOf(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      declaration +
      `<Relationships xmlns="${packageRelationships}">` +
      `<Relationship Id="rId1" Type="${relationshipNamespace}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${relationshipNamespace}/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    "xl/styles.xml":
      declaration +
      `<styleSheet xmlns="${spreadsheetNamespace}">` +
      `<numFmts count="2"><numFmt numFmtId="164" formatCode="d mmm yyyy"/>` +
      `<numFmt numFmtId="165" formatCode="d mmm yyyy h:mm AM/PM"/></numFmts>` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`,
  };
}

/** The sheet's opening, up to its first row: the header row frozen above the rest. */
export const sheetStart =
  declaration +
  `<worksheet xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}">` +
  `<sheetViews><sheetView workbookViewId="0">` +
  `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
  `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
  `<sheetData>`;

export const sheetEnd = `</sheetData></worksheet>`;
