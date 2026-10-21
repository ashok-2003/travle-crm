// Reading a CSV (spec B3, D11): the encodings Excel and others save in, the delimiter found from the first row, the
// header's blanks and repeats named, empty rows skipped while every row keeps its number, and one apostrophe dropped.
import { describe, expect, it } from "vitest";
import { createSpreadsheets, type ReadLimits } from "../../src/spreadsheets/index.js";

const limits: ReadLimits = { kind: "csv", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 };
const spreadsheets = createSpreadsheets();
const read = (bytes: Uint8Array) => spreadsheets.read(bytes, limits);
const utf8 = (text: string) => new TextEncoder().encode(text);

describe("reading a CSV", () => {
  it("reads UTF-8 with or without a byte-order mark, UTF-16 with one, and Windows-1252 otherwise", async () => {
    const text = "Name,City\r\nAsha,Café – Mumbai\r\n";
    const littleEndian = Buffer.from(text, "utf16le");
    const bigEndian = Buffer.from(littleEndian).swap16();
    // Windows-1252 writes é as 0xE9 and the en dash as 0x96, which isn't Latin-1.
    const windows1252 = Buffer.concat([
      Buffer.from("Name,City\r\nAsha,Caf", "latin1"),
      Buffer.from([0xe9, 0x20, 0x96]),
      Buffer.from(" Mumbai\r\n", "latin1"),
    ]);
    const files = [
      utf8(text),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8(text)]),
      Buffer.concat([Buffer.from([0xff, 0xfe]), littleEndian]),
      Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]),
      windows1252,
    ];
    for (const file of files) {
      const sheet = await read(file);
      expect(sheet.header).toEqual(["Name", "City"]);
      expect(sheet.rows).toEqual([{ rowNumber: 2, cells: ["Asha", "Café – Mumbai"] }]);
    }
  });

  it("finds the delimiter from the first row: comma, semicolon or tab", async () => {
    expect((await read(utf8("Name;City;Phone\nAsha;Goa;1\n"))).header).toEqual(["Name", "City", "Phone"]);
    expect((await read(utf8("Name\tCity\nAsha\tGoa\n"))).rows[0]?.cells).toEqual(["Asha", "Goa"]);
    // A delimiter inside quotes doesn't count, and a tie goes to the comma.
    expect((await read(utf8('"Name;Full",City\nAsha;S,Goa\n'))).header).toEqual(["Name;Full", "City"]);
    expect((await read(utf8("a;b,c\n1;2,3\n"))).header).toEqual(["a;b", "c"]);
  });

  it("names a blank header by its letter and a repeated one with (2)", async () => {
    const sheet = await read(utf8("Name,,Name,Name\n1,2,3,4\n"));
    expect(sheet.header).toEqual(["Name", "Column B", "Name (2)", "Name (3)"]);
    // A data row longer than the header names its extra columns too.
    expect((await read(utf8("Name\nAsha,extra\n"))).header).toEqual(["Name", "Column B"]);
  });

  it("skips empty rows, numbering each row as the file does", async () => {
    const sheet = await read(utf8('Name,Note\nAsha,a\n\n,\nRavi,"two\nlines"\nMeera,b\n'));
    expect(sheet.rows).toEqual([
      { rowNumber: 2, cells: ["Asha", "a"] },
      { rowNumber: 5, cells: ["Ravi", "two\nlines"] },
      { rowNumber: 6, cells: ["Meera", "b"] },
    ]);
    expect(sheet.sheetName).toBeNull();
    expect(sheet.sheetCount).toBe(1);
  });

  it("drops one leading apostrophe", async () => {
    const sheet = await read(utf8("Phone,Note,Plain\n'+91 98765 43210,''x,  spaced  \n"));
    expect(sheet.rows[0]?.cells).toEqual(["+91 98765 43210", "'x", "spaced"]);
    // The apostrophe goes first, then the space behind it: a neutralised tab reads back as its text (D9).
    const tabbed = await read(utf8("Name,Note\nAsha,'\tfoo\n"));
    expect(tabbed.rows[0]?.cells).toEqual(["Asha", "foo"]);
  });
});
