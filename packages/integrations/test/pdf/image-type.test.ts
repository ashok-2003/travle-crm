// A logo's real type comes from its bytes, not from what the browser declared (storage checks only the declared one),
// and its size from its header, before anything decodes it.
import { describe, expect, it } from "vitest";
import { imageOf } from "../../src/pdf/index.js";
import { tinyJpeg, tinyPng } from "./logos.js";

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
