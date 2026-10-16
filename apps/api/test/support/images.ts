// Logos for the HTTP tests: the smallest PNG a PDF can draw, and real PNGs of any size, a few kilobytes however many
// pixels they hold (a decompression bomb's shape).
import { crc32, deflateSync } from "node:zlib";

/** A 1x1 transparent PNG. */
export const tinyPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (character) => character.charCodeAt(0),
);

/** A real black PNG of this size, one bit a pixel. */
export function pngOfSize(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  // Width, height, bit depth 1, greyscale, then the default compression, filter and interlace.
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(1, 8);
  // Each row: its filter byte, then a bit for each pixel, all zero.
  const rows = Buffer.alloc(height * (1 + Math.ceil(width / 8)));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = [signature, chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))];
  return new Uint8Array(Buffer.concat(png));
}
