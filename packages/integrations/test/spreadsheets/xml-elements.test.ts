// A workbook part's elements as read-excel-file sees them (D1): only the elements asked for are kept, so a part of
// millions of others costs little memory, and our saxen from npm and the reader's own copy of it read markup alike
// (item 9): the same open tags with the same attributes, and the names and values the reader takes from them.
import { createRequire } from "node:module";
import path from "node:path";
import { Parser } from "saxen";
import { describe, expect, it } from "vitest";
import { readerElementsOf } from "../../src/spreadsheets/xml-elements.js";

const megabytes = (bytes: number) => bytes / (1024 * 1024);

/** The reader's files, by path: its package exports neither its copy of saxen nor its XML stream. */
const require = createRequire(import.meta.url);
const readerDirectory = path.dirname(require.resolve("read-excel-file/package.json"));
const { default: ReaderParser } = require(path.join(readerDirectory, "commonjs/saxen/parser.js")) as {
  default: typeof Parser;
};
const { default: parseXmlStream } = require(path.join(readerDirectory, "commonjs/xml/parseXmlStream.saxen.js")) as {
  default: (
    state: object,
    onOpenTag: (name: string, attributes: Record<string, string>) => void,
  ) => { promise: Promise<void>; write: (xml: string) => void; end: () => void };
};

/** Markup that has fooled a sizer: quoting, a ">" in a value, prefixes, xmlns: ones, entities, comments, CDATA, PIs. */
const markup = [
  `<row r="2"><c r="A2"><v>1</v></c></row>`,
  `<x:row r='3'><x:c x:r="B3"/></x:row>`,
  `<row a=">" r="4"><c a='>' r="C4"></c></row>`,
  `<xmlns:row r="5"><xmlns:c xmlns:x:r="D5"></xmlns:c></xmlns:row>`,
  `<row r="&#54;"><c r="X&#70;D6"/></row>`,
  `<!-- <row r="9"> --><?pi <c r="Z9"> ?><row r="7"><c r="A7"><is><t><![CDATA[<c r="Z7">]]></t></is></c></row>`,
  `<row x:r="&amp;#52;00000" r="8"><c r="A8" x:r="B8"/></row>`,
];

/** Each open tag's raw name and attributes, as a parser of saxen's kind reports them. */
function openTagsOf(parser: Parser, xml: string) {
  const tags: [string, Record<string, string> | false][] = [];
  parser.on("openTag", (name, attributesOf) => {
    tags.push([name, attributesOf()]);
  });
  parser.on("error", () => {
    tags.push(["error", false]);
  });
  parser.parse(xml);
  return tags;
}

/** The rows and cells the reader takes, with the number it reads from each (`r`). */
async function readerPositions(xml: string) {
  const positions: [string, string | null][] = [];
  const stream = parseXmlStream({}, (name, attributes) => {
    if (name === "row" || name === "c") positions.push([name, attributes.r ?? null]);
  });
  stream.write(xml);
  stream.end();
  await stream.promise;
  return positions;
}

describe("readerElementsOf", () => {
  it("keeps only the elements asked for, so a workbook.xml of millions of others costs little (item 3)", () => {
    const xml = `<workbook><sheets><sheet name="Leads" r:id="rId1"/></sheets>${"<a/>".repeat(3_000_000)}</workbook>`;
    const before = process.memoryUsage().heapUsed;
    const sheets = readerElementsOf(xml, new Set(["sheet"]));
    expect(megabytes(process.memoryUsage().heapUsed - before)).toBeLessThan(64);
    expect(sheets).toEqual([{ name: "sheet", attributes: { name: "Leads", id: "rId1" }, ambiguous: false }]);
  });

  it("parses with saxen from npm exactly as the reader's own copy of it does", () => {
    for (const xml of markup) expect(openTagsOf(new Parser(), xml)).toEqual(openTagsOf(new ReaderParser(), xml));
  });

  it("takes each row's and cell's name and number as the reader does, or says two names met", async () => {
    for (const xml of markup) {
      const ours = readerElementsOf(xml, new Set(["row", "c"])) ?? [];
      const theirs = await readerPositions(xml);
      expect(ours.map((element) => element.name)).toEqual(theirs.map(([name]) => name));
      ours.forEach((element, index) => {
        if (!element.ambiguous) expect(element.attributes.r ?? null).toBe(theirs[index]?.[1]);
      });
    }
    // Where two names meet, the reader decodes the plain one's value twice: the sizer counts both readings.
    expect(await readerPositions(markup[6] ?? "")).toEqual([
      ["row", "400000"],
      ["c", "B8"],
    ]);
    expect(readerElementsOf(markup[6] ?? "", new Set(["row", "c"]))?.map((element) => element.ambiguous)).toEqual([
      true,
      true,
    ]);
  });
});
