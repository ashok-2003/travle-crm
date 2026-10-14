// WOFF fonts are unpacked to plain TrueType before React-PDF sees them, because fontkit misreads some WOFF files
// (IBM Plex Mono's space glyph) and every WOFF2 file it has to subset.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { sfntFromWoff } from "../../src/pdf/woff.js";

const require = createRequire(import.meta.url);
const woff = readFileSync(require.resolve("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff"));

describe("sfntFromWoff", () => {
  it("unpacks every table into a TrueType file with the WOFF's declared size", () => {
    const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
    const tableCount = view.getUint16(12);
    const totalSfntSize = view.getUint32(16);

    const sfnt = sfntFromWoff(woff);
    const out = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    expect(out.getUint32(0)).toBe(view.getUint32(4)); // the WOFF's flavor: TrueType outlines
    expect(out.getUint16(4)).toBe(tableCount);
    expect(sfnt.byteLength).toBe(totalSfntSize);
    const tags = Array.from({ length: tableCount }, (_, index) =>
      new TextDecoder().decode(sfnt.subarray(12 + index * 16, 16 + index * 16)),
    );
    expect(tags).toEqual([...tags].sort());
    expect(tags).toContain("glyf");
  });

  it("refuses a file that isn't WOFF", () => {
    expect(() => sfntFromWoff(new TextEncoder().encode("%PDF-1.7 not a font"))).toThrow(/Not a WOFF font/);
  });
});

describe("sfntFromWoff on bad input", () => {
  const copy = () => Uint8Array.from(woff);
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstEntry = 44;

  it("refuses a truncated file", () => {
    expect(() => sfntFromWoff(copy().subarray(0, 200))).toThrow(RangeError);
  });

  it("refuses a table whose declared length is wrong", () => {
    const bytes = copy();
    const length = view(bytes).getUint32(firstEntry + 12);
    view(bytes).setUint32(firstEntry + 12, length + 1);
    expect(() => sfntFromWoff(bytes)).toThrow(RangeError);
  });

  it("refuses tables that add up to more than the declared size", () => {
    const bytes = copy();
    view(bytes).setUint32(16, 100);
    expect(() => sfntFromWoff(bytes)).toThrow(/larger than/);
  });

  it("refuses a table that unpacks to more than it declares", () => {
    const bytes = copy();
    // Find a compressed table and shrink its declared length; the inflate must stop rather than grow.
    const count = view(bytes).getUint16(12);
    for (let index = 0; index < count; index++) {
      const entry = firstEntry + index * 20;
      const compressed = view(bytes).getUint32(entry + 8);
      const length = view(bytes).getUint32(entry + 12);
      if (compressed < length) {
        view(bytes).setUint32(entry + 12, compressed + 1);
        break;
      }
    }
    expect(() => sfntFromWoff(bytes)).toThrow();
  });

  it("refuses a font with no tables", () => {
    const bytes = copy();
    view(bytes).setUint16(12, 0);
    expect(() => sfntFromWoff(bytes)).toThrow(/no tables/);
  });
});
