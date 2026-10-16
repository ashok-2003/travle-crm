// A logo's real type comes from its bytes, not from what the browser declared (storage checks only the declared one),
// and its size from its headers, before anything decodes it. A PNG is read as png-js reads it (React-PDF and pdfkit
// decode with it), and one it would read otherwise is no image; its pixel data inflates to no more than its header
// says, every row with a filter type png-js knows.
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { imageOf, isSafeToDraw } from "../../src/pdf/index.js";
import {
  pngChunk,
  pngHeader,
  pngOf,
  pngOfSize,
  narrowInterlacedPng,
  pngWithFilterType,
  pngWithOversizedPixelData,
  pngWithSecondHeader,
  tinyJpeg,
  tinyPng,
} from "../testing.js";

/** The tiny PNG with its IHDR claiming another size: the header is all imageOf reads. */
function pngClaiming(width: number, height: number): Uint8Array {
  const bytes = tinyPng.slice();
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A JPEG's start, then these markers, each with a segment of `body` bytes (its length counts its own two). */
function jpegWith(...segments: { marker: number; body: number[] }[]): Uint8Array {
  const bytes = [0xff, 0xd8];
  for (const { marker, body } of segments) {
    const length = body.length + 2;
    bytes.push(0xff, marker, length >> 8, length & 0xff, ...body);
  }
  return Uint8Array.from(bytes);
}

/** A baseline frame header (SOF0) of this size: precision, height, width, then one component. */
const frame = (width: number, height: number) => ({
  marker: 0xc0,
  body: [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0],
});

describe("imageOf", () => {
  it("knows a PNG and a JPEG by their signatures, and their size by their headers", () => {
    expect(imageOf(tinyPng)).toEqual({ contentType: "image/png", width: 1, height: 1 });
    // A progressive JPEG (SOF2), after its JFIF and quantisation segments.
    expect(imageOf(tinyJpeg)).toEqual({ contentType: "image/jpeg", width: 1, height: 1 });
  });

  it("reads the size a small file claims, however many pixels that is", () => {
    expect(imageOf(pngClaiming(8000, 8000))).toEqual({ contentType: "image/png", width: 8000, height: 8000 });
    const exif = { marker: 0xe1, body: Array.from({ length: 300 }, () => 0) };
    const tables = { marker: 0xc4, body: [0, 0, 0] };
    expect(imageOf(jpegWith(exif, tables, frame(3000, 2000)))).toEqual({
      contentType: "image/jpeg",
      width: 3000,
      height: 2000,
    });
  });

  it("knows nothing else, nor a header cut short, nor a size of nothing", () => {
    expect(imageOf(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageOf(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(imageOf(new Uint8Array())).toBeNull();
    expect(imageOf(tinyPng.subarray(0, 7))).toBeNull();
    expect(imageOf(tinyPng.subarray(0, 23))).toBeNull();
    expect(imageOf(tinyJpeg.subarray(0, 2))).toBeNull();
    expect(imageOf(pngClaiming(0, 10))).toBeNull();
    expect(imageOf(jpegWith(frame(10, 0)))).toBeNull();
    // The scan begins before any frame header says the size.
    expect(imageOf(jpegWith({ marker: 0xda, body: [0, 0] }, frame(10, 10)))).toBeNull();
    expect(imageOf(jpegWith(frame(10, 10)).subarray(0, 8))).toBeNull();
  });
});

describe("a PNG, read as png-js reads it", () => {
  const ihdr = (width: number, height: number, options?: Parameters<typeof pngHeader>[2]) =>
    pngChunk("IHDR", pngHeader(width, height, options));
  const idat = (bytes: number) => pngChunk("IDAT", deflateSync(new Uint8Array(bytes)));
  const iend = pngChunk("IEND", new Uint8Array());

  it("is no image when png-js would decode another size than its first IHDR's", () => {
    const twice = pngWithSecondHeader();
    expect(twice.byteLength).toBeLessThan(100);
    expect(imageOf(twice)).toBeNull();
    // png-js reads 13 bytes of IHDR whatever its length says, then the next chunk where this reader sees data.
    const hidden = new Uint8Array([...pngHeader(1, 1), ...ihdr(20_000, 20_000).subarray(0, 13)]);
    expect(imageOf(pngOf(pngChunk("IHDR", hidden), idat(2), iend))).toBeNull();
    expect(imageOf(pngOf(pngChunk("tEXt", new TextEncoder().encode("a\0b")), ihdr(1, 1), idat(2), iend))).toBeNull();
    // An IHDR of no bytes at all, in a file of 20 to 28 bytes: no image, not a read past the end.
    for (const file of [pngOf(pngChunk("IHDR", new Uint8Array())), pngOf(pngChunk("IHDR", new Uint8Array(8)))]) {
      expect(imageOf(file), String(file.byteLength)).toBeNull();
    }
  });

  it("is no image for a colour type or bit depth PNG doesn't allow, which png-js would size by", () => {
    for (const options of [
      { bitDepth: 255, colourType: 6 },
      { bitDepth: 1, colourType: 6 },
      { bitDepth: 3, colourType: 0 },
      { bitDepth: 8, colourType: 5 },
      { bitDepth: 1, colourType: 0, interlace: 2 },
    ]) {
      expect(imageOf(pngOf(ihdr(1, 1, options), idat(8), iend)), JSON.stringify(options)).toBeNull();
    }
    expect(imageOf(pngOf(ihdr(1, 1, { bitDepth: 16, colourType: 6 }), idat(9), iend))).toMatchObject({ width: 1 });
  });

  it("is no image with a tRNS png-js skips, a chunk past the end, no pixel data or no end", () => {
    const rgba = { bitDepth: 8, colourType: 6 };
    const transparency = pngChunk("tRNS", new Uint8Array(6));
    expect(imageOf(pngOf(ihdr(1, 1, rgba), transparency, idat(5), iend))).toBeNull();
    expect(imageOf(pngOf(ihdr(1, 1, { bitDepth: 8, colourType: 2 }), transparency, idat(4), iend))).toMatchObject({
      width: 1,
    });
    expect(imageOf(pngOf(ihdr(1, 1), pngChunk("IDAT", new Uint8Array(4), 0xfffffff0), iend))).toBeNull();
    expect(imageOf(pngOf(ihdr(1, 1), iend))).toBeNull();
    expect(imageOf(pngOf(ihdr(1, 1), idat(2)))).toBeNull();
  });

  it("is no image when interlaced, which png-js misreads for an image 4 pixels wide or narrower", () => {
    const interlaced = narrowInterlacedPng();
    expect(imageOf(interlaced)).toBeNull();
    expect(imageOf(pngOf(ihdr(8, 8, { interlace: 1 }), idat(30), iend))).toBeNull();
    expect(imageOf(pngOf(ihdr(8, 8), idat(16), iend))).toMatchObject({ width: 8, height: 8 });
  });

  it("holds pixel data that inflates to no more than its header's rows", async () => {
    expect(await isSafeToDraw(tinyPng)).toBe(true);
    expect(await isSafeToDraw(pngOfSize(4000, 4000))).toBe(true);
    // 8×8, a bit a pixel: 8 rows of a filter byte and one byte.
    const eight = (bytes: number) => pngOf(ihdr(8, 8), idat(bytes), iend);
    expect(await isSafeToDraw(eight(16))).toBe(true);
    expect(await isSafeToDraw(eight(17))).toBe(false);
    // A megabyte of pixel data for 16×16: from 1 MB stored, a gigabyte.
    expect(await isSafeToDraw(pngWithOversizedPixelData())).toBe(false);
    expect(await isSafeToDraw(pngOf(ihdr(1, 1), pngChunk("IDAT", new Uint8Array([1, 2, 3])), iend))).toBe(false);
    // A JPEG is drawn as stored; anything else is no image.
    expect(await isSafeToDraw(tinyJpeg)).toBe(true);
    expect(await isSafeToDraw(new TextEncoder().encode("GIF89a"))).toBe(false);
  });

  it("holds pixel data whose every row starts with a filter type png-js knows, whose others it throws at", async () => {
    for (const filterType of [0, 1, 2, 3, 4]) {
      expect(await isSafeToDraw(pngWithFilterType(filterType)), String(filterType)).toBe(true);
    }
    for (const filterType of [5, 200, 255]) {
      expect(await isSafeToDraw(pngWithFilterType(filterType)), String(filterType)).toBe(false);
    }
    // 8×8, a bit a pixel, so a row is 2 bytes: only each row's first byte is a filter type, pixels may be anything.
    const rows = (bytes: number[]) => pngOf(ihdr(8, 8), pngChunk("IDAT", deflateSync(new Uint8Array(bytes))), iend);
    const fine = Array.from({ length: 8 }, (_, row) => [row % 5, 0xff]).flat();
    expect(await isSafeToDraw(rows(fine))).toBe(true);
    const fifthBad = fine.map((byte, index) => (index === 8 ? 7 : byte));
    expect(await isSafeToDraw(rows(fifthBad))).toBe(false);
    // A last row cut short still has its filter type read.
    expect(await isSafeToDraw(rows([...fine.slice(0, 14), 9]))).toBe(false);
    expect(await isSafeToDraw(rows(fine.slice(0, 15)))).toBe(true);
  });
});
