// Writing (spec B39, B40): .xlsx of values only with a bold frozen header and typed cells, CSV as Excel opens it in
// every script, a leading apostrophe on text a spreadsheet would run as a formula, and 50,000 rows streamed in batches.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  createSpreadsheets,
  neutraliseFormula,
  type SpreadsheetKind,
  type WriterColumn,
  type WrittenCell,
} from "../../src/spreadsheets/index.js";

const spreadsheets = createSpreadsheets();
const columns: WriterColumn[] = [
  { header: "Name", kind: "text" },
  { header: "Phone", kind: "phone" },
  { header: "Adults", kind: "number" },
  { header: "Travel from", kind: "date" },
  { header: "Added on", kind: "date-time" },
];

async function fileOf(kind: SpreadsheetKind, rows: WrittenCell[][], sheetColumns = columns) {
  const writer = spreadsheets.writer({ kind, sheetName: "Leads", columns: sheetColumns });
  writer.write(rows);
  return writer.finish();
}

const partsOf = (bytes: Uint8Array) =>
  Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, part]) => [name, strFromU8(part)]));

describe("writing", () => {
  it("writes .xlsx values only, with a bold frozen header, dates as date cells and numbers as numbers", async () => {
    const bytes = await fileOf("xlsx", [["Asha", "+91 98765 43210", 2, "2026-10-12", "2026-10-19T16:12"]]);
    const parts = partsOf(bytes);
    const sheet = parts["xl/worksheets/sheet1.xml"] ?? "";
    expect(sheet).not.toMatch(/<f[\s>]/);
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toMatch(/<c r="A1" s="1" t="inlineStr">/);
    expect(sheet).toContain('<c r="C2"><v>2</v></c>');
    expect(sheet).toContain('<c r="D2" s="2"><v>46307</v></c>');
    // 16:12 is 0.675 of a day.
    expect(sheet).toContain('<c r="E2" s="3"><v>46314.675</v></c>');
    expect(parts["xl/styles.xml"]).toContain("<b/>");
    expect(parts["xl/styles.xml"]).toContain('formatCode="d mmm yyyy"');
    expect(parts["xl/styles.xml"]).toContain('formatCode="d mmm yyyy h:mm AM/PM"');
    expect(parts["xl/workbook.xml"]).toContain('<sheet name="Leads" sheetId="1" r:id="rId1"/>');
    const read = await spreadsheets.read(bytes, { kind: "xlsx", maxRows: 10, maxColumns: 10, maxCellLength: 4000 });
    expect(read.header).toEqual(["Name", "Phone", "Adults", "Travel from", "Added on"]);
    expect(read.rows[0]?.cells).toEqual(["Asha", "+91 98765 43210", "2", "2026-10-12", "2026-10-19"]);
  });

  it("writes CSV as UTF-8 with a byte-order mark, CRLF line ends and every cell quoted", async () => {
    const bytes = await fileOf("csv", [["आशा शर्मा", null, 2, "2026-10-12", "2026-10-19T16:12"]]);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe(
      '"Name","Phone","Adults","Travel from","Added on"\r\n' + '"आशा शर्मा","","2","2026-10-12","2026-10-19 16:12"\r\n',
    );
  });

  it("puts an apostrophe before text starting with =, +, -, @, a tab or a carriage return, in both formats", async () => {
    for (const text of ["=HYPERLINK(1)", "+1", "-1", "@SUM(1)", "\tx", "\rx"])
      expect(neutraliseFormula(text)).toBe(`'${text}`);
    for (const text of ["Asha", "'quoted", "1=1", ""]) expect(neutraliseFormula(text)).toBe(text);
    const textOnly: WriterColumn[] = [{ header: "=Name", kind: "text" }];
    const csv = new TextDecoder().decode(await fileOf("csv", [["=cmd|' /C calc'!A0"]], textOnly));
    expect(csv).toBe("\"'=Name\"\r\n\"'=cmd|' /C calc'!A0\"\r\n");
    const sheet = partsOf(await fileOf("xlsx", [["@SUM(1)"]], textOnly))["xl/worksheets/sheet1.xml"] ?? "";
    expect(sheet).toContain("<t>'=Name</t>");
    expect(sheet).toContain("<t>'@SUM(1)</t>");
  });

  it("keeps an .xlsx phone cell as +91 98765 43210, and gives the CSV's the apostrophe", async () => {
    const row: WrittenCell[] = ["Asha", "+91 98765 43210", null, null, null];
    expect(partsOf(await fileOf("xlsx", [row]))["xl/worksheets/sheet1.xml"]).toContain("<t>+91 98765 43210</t>");
    expect(new TextDecoder().decode(await fileOf("csv", [row]))).toContain(`"Asha","'+91 98765 43210"`);
  });

  it("reads back what it wrote, each apostrophe dropped once", async () => {
    const row: WrittenCell[] = ["=Asha & <Ravi>", "+91 98765 43210", 1.5, "2026-12-01", "2026-12-01T00:00"];
    for (const kind of ["csv", "xlsx"] as const) {
      const read = await spreadsheets.read(await fileOf(kind, [row]), {
        kind,
        maxRows: 10,
        maxColumns: 10,
        maxCellLength: 4000,
      });
      expect(read.rows[0]?.cells.slice(0, 4)).toEqual(["=Asha & <Ravi>", "+91 98765 43210", "1.5", "2026-12-01"]);
    }
  });

  it("streams 50,000 rows of 16 columns 1,000 at a time, holding only the compressed output", async () => {
    const sixteen: WriterColumn[] = Array.from({ length: 16 }, (_, index) => ({
      header: `Column ${String(index + 1)}`,
      kind: index === 2 ? "number" : index === 3 ? "date" : "text",
    }));
    const writer = spreadsheets.writer({ kind: "xlsx", sheetName: "Leads", columns: sixteen });
    const before = process.memoryUsage().heapUsed;
    let peak = 0;
    for (let batch = 0; batch < 50; batch += 1) {
      writer.write(
        Array.from({ length: 1000 }, (_, row) =>
          sixteen.map((column, index) =>
            column.kind === "number"
              ? row
              : column.kind === "date"
                ? "2026-10-12"
                : `${String(batch * 1000 + row)}-${String(index)}`,
          ),
        ),
      );
      peak = Math.max(peak, process.memoryUsage().heapUsed - before);
    }
    const bytes = await writer.finish();
    expect(peak / (1024 * 1024)).toBeLessThan(100);
    const read = await spreadsheets.read(bytes, { kind: "xlsx", maxRows: 50_000, maxColumns: 16, maxCellLength: 4000 });
    expect(read.rows).toHaveLength(50_000);
    expect(read.rows.at(-1)?.cells[0]).toBe("49999-0");
  }, 60_000);
});
