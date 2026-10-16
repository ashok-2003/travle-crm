// Images for every package's tests (`@travel-crm/integrations/testing`; only tests may import it): the smallest logos a
// PDF can draw, real PNGs of any size, the chunks to build others, and the PNGs made to get past a logo's checks.
import { crc32, deflateSync } from "node:zlib";

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

/** A 1x1 transparent PNG. */
export const tinyPng = bytesOf(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
);

/** A 1x1 grey progressive JPEG. */
export const tinyJpeg = bytesOf(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////" +
    "////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
);

/** One PNG chunk: the data's length (or the one given, to lie), the type, the data and the CRC of type and data. */
export function pngChunk(type: string, data: Uint8Array, length = data.byteLength): Uint8Array {
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const framed = Buffer.alloc(typed.byteLength + 8);
  framed.writeUInt32BE(length, 0);
  typed.copy(framed, 4);
  framed.writeUInt32BE(crc32(typed), typed.byteLength + 4);
  return framed;
}

/** IHDR's 13 bytes: width, height, bit depth, colour type, then compression and filter 0, and the interlace. */
export function pngHeader(width: number, height: number, { bitDepth = 1, colourType = 0, interlace = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(bitDepth, 8);
  header.writeUInt8(colourType, 9);
  header.writeUInt8(interlace, 12);
  return header;
}

/** A PNG of these chunks, after the signature. */
export function pngOf(...chunks: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]));
}

const end = () => pngChunk("IEND", new Uint8Array());

/** A real black PNG of this size, a bit a pixel: a few kilobytes however many pixels it holds (a bomb's shape). */
export function pngOfSize(width: number, height: number): Uint8Array {
  // Each row: its filter byte, then a bit for each pixel, all zero.
  const rows = new Uint8Array(height * (1 + Math.ceil(width / 8)));
  return pngOf(pngChunk("IHDR", pngHeader(width, height)), pngChunk("IDAT", deflateSync(rows)), end());
}

/**
 * Under 100 bytes: an IHDR of 1×1, then a second of 20000×20000 RGBA, which png-js reads last and so decodes, 1.6 GB
 * of pixels and as much again for pdfkit's alpha.
 */
export function pngWithSecondHeader(): Uint8Array {
  const rgba = { bitDepth: 8, colourType: 6 };
  return pngOf(
    pngChunk("IHDR", pngHeader(1, 1, rgba)),
    pngChunk("IHDR", pngHeader(20_000, 20_000, rgba)),
    pngChunk("IDAT", deflateSync(new Uint8Array(5))),
    end(),
  );
}

/** A 16×16 PNG whose pixel data inflates to a megabyte rather than its 48 bytes: a gigabyte at 1 MB stored. */
export function pngWithOversizedPixelData(): Uint8Array {
  return pngOf(pngChunk("IHDR", pngHeader(16, 16)), pngChunk("IDAT", deflateSync(new Uint8Array(1024 * 1024))), end());
}
