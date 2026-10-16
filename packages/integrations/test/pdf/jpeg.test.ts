// A JPEG is drawn from only the segments that draw it, in a layout React-PDF's parser (jay-peg) reads as JPEG does:
// its metadata, where jay-peg's EXIF reader can be made to run out of memory, never reaches it; and a JPEG whose
// segments can't be drawn so is no logo.
import { describe, expect, it } from "vitest";
import { imageOf, isSafeToDraw, jpegForDrawing } from "../../src/pdf/index.js";
import { jpegFrame, jpegOf, jpegScan, jpegSegment, jpegWithExifComponents, tinyJpeg } from "../testing.js";

/** The markers in a JPEG, walked as JPEG lays them out (a scan's data skipped). */
function markersOf(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    const marker = bytes[offset + 1] ?? 0;
    markers.push(marker);
    if (marker === 0xd9) break;
    offset += 2 + (((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
    if (marker === 0xda)
      while (offset < bytes.byteLength && !(bytes[offset] === 0xff && bytes[offset + 1] !== 0)) offset++;
  }
  return markers;
}

const tables = jpegSegment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
const huffman = jpegSegment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]);
const drawable = (...extra: Uint8Array[]) => jpegOf(...extra, tables, jpegFrame(2, 3), huffman, jpegScan());

describe("a JPEG as it is drawn", () => {
  it("keeps the tables, the frame and the scans, and leaves out the metadata", () => {
    const comment = jpegSegment(0xfe, [...Buffer.from("made with a phone")]);
    const icc = jpegSegment(0xe2, [1, 2, 3]);
    const adobe = jpegSegment(0xee, [...Buffer.from("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
    const drawn = jpegForDrawing(drawable(comment, icc, adobe, jpegSegment(0xe1, [1, 2])));
    expect(drawn).not.toBeNull();
    expect(markersOf(drawn ?? new Uint8Array())).toEqual([0xee, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);
    expect(imageOf(drawn ?? new Uint8Array())).toEqual({ contentType: "image/jpeg", width: 2, height: 3 });
    // The tiny logo's JFIF goes, and its scan, cut short, gets its EOI.
    expect(markersOf(jpegForDrawing(tinyJpeg) ?? new Uint8Array())).toEqual([0xdb, 0xc2, 0xc4, 0xda, 0xd9]);
  });

  it("leaves out an EXIF that would take jay-peg out of memory, so the logo is still safe to draw", async () => {
    const bomb = jpegWithExifComponents(100_000_000, 8);
    expect(bomb.byteLength).toBeLessThan(200);
    expect(markersOf(jpegForDrawing(bomb) ?? new Uint8Array())).toEqual([0xc0, 0xda, 0xd9]);
    expect(await isSafeToDraw(bomb)).toBe(true);
  });

  it("skips fill bytes and TEM, and drops whatever follows EOI", () => {
    const filled = jpegOf(
      Uint8Array.of(0xff, 0xff, 0xff, 0x01),
      tables,
      jpegFrame(2, 3),
      jpegScan(),
      jpegSegment(0xe1, []),
    );
    const drawn = jpegForDrawing(filled) ?? new Uint8Array();
    expect(markersOf(drawn)).toEqual([0xdb, 0xc0, 0xda, 0xd9]);
    expect(drawn.at(-1)).toBe(0xd9);
  });

  it("is nothing to draw when jay-peg would read its segments otherwise, or there is no frame and scan", async () => {
    for (const [name, file] of [
      [
        "a 16-bit quantisation table",
        jpegOf(
          jpegSegment(
            0xdb,
            Array.from({ length: 129 }, () => 1),
          ),
          jpegFrame(1, 1),
          jpegScan(),
        ),
      ],
      ["a frame longer than its components", jpegOf(jpegSegment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0]), jpegScan())],
      ["a scan header longer than its components", jpegOf(jpegFrame(1, 1), jpegSegment(0xda, [1, 1, 0, 0, 63, 0, 0]))],
      ["a restart interval of 5 bytes", jpegOf(jpegSegment(0xdd, [0, 1, 0]), jpegFrame(1, 1), jpegScan())],
      ["two frames", jpegOf(jpegFrame(1, 1), jpegFrame(9000, 9000), jpegScan())],
      ["a scan before the frame", jpegOf(jpegScan(), jpegFrame(1, 1))],
      ["a restart marker outside a scan", jpegOf(Uint8Array.of(0xff, 0xd3), jpegFrame(1, 1), jpegScan())],
      ["a segment past the end", jpegOf(jpegFrame(1, 1), jpegSegment(0xe0, [1], 400))],
      ["no scan", jpegOf(jpegFrame(1, 1), Uint8Array.of(0xff, 0xd9))],
      ["bytes that aren't a marker", jpegOf(jpegFrame(1, 1), Uint8Array.of(0x12, 0x34), jpegScan())],
    ] as const) {
      expect(jpegForDrawing(file), name).toBeNull();
      expect(await isSafeToDraw(file), name).toBe(false);
    }
  });
});
