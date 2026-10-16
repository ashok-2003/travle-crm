// Images for every package's tests (`@travel-crm/integrations/testing`; only tests may import it): the smallest logos a
// PDF can draw, real PNGs of any size, the chunks and segments to build others, and the PNGs and JPEGs made to get past
// a logo's checks.
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

/**
 * A 1×1 RGBA PNG whose one row starts with this filter type: above 4, png-js throws inside its zlib callback, which
 * nothing catches, when pdfkit has it decode the pixels for their alpha.
 */
export function pngWithFilterType(filterType: number): Uint8Array {
  return pngOf(
    pngChunk("IHDR", pngHeader(1, 1, { bitDepth: 8, colourType: 6 })),
    pngChunk("IDAT", deflateSync(new Uint8Array([filterType, 0, 0, 0, 255]))),
    end(),
  );
}

/**
 * A valid 2×2 RGBA interlaced PNG with a red pixel at (1,0). png-js reads a filter byte for Adam7's empty passes too,
 * so it takes the red pixel's 200 for a filter type and throws.
 */
export function narrowInterlacedPng(): Uint8Array {
  // Adam7's three passes that hold pixels here, each row a filter byte and RGBA: (0,0); (1,0); (0,1) and (1,1).
  const rows = [0, 0, 0, 0, 255, 0, 200, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 255];
  return pngOf(
    pngChunk("IHDR", pngHeader(2, 2, { bitDepth: 8, colourType: 6, interlace: 1 })),
    pngChunk("IDAT", deflateSync(new Uint8Array(rows))),
    end(),
  );
}

/** A 16×16 PNG whose pixel data inflates to a megabyte rather than its 48 bytes: a gigabyte at 1 MB stored. */
export function pngWithOversizedPixelData(): Uint8Array {
  return pngOf(pngChunk("IHDR", pngHeader(16, 16)), pngChunk("IDAT", deflateSync(new Uint8Array(1024 * 1024))), end());
}

/** A JPEG segment: its marker, then its length (counting itself, or the one given, to lie) and its data. */
export function jpegSegment(marker: number, data: readonly number[], length = data.length + 2): Uint8Array {
  return Uint8Array.from([0xff, marker, length >> 8, length & 0xff, ...data]);
}

/** A JPEG of these parts after SOI. */
export function jpegOf(...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat([Uint8Array.of(0xff, 0xd8), ...parts]));
}

/** A baseline frame (SOF0) of this size, one component. */
export const jpegFrame = (width: number, height: number) =>
  jpegSegment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);

/** A scan of the one component, its data, then EOI. */
export const jpegScan = (data: readonly number[] = [0x12, 0x34]) =>
  Uint8Array.from([...jpegSegment(0xda, [1, 1, 0, 0, 63, 0]), ...data, 0xff, 0xd9]);

/**
 * A 1×1 JPEG whose EXIF (APP1) lists `entries` entries, each claiming `count` 16-bit components: jay-peg pushes one
 * value for each into an array, so a hundred-odd bytes take a worker out of memory.
 */
export function jpegWithExifComponents(count: number, entries: number): Uint8Array {
  const be16 = (value: number) => [value >> 8, value & 0xff];
  const be32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const ifd = [...be16(entries)];
  for (let entry = 0; entry < entries; entry++) ifd.push(...be16(0x0100), ...be16(3), ...be32(count), 0, 0, 0, 0);
  const tiff = [0x4d, 0x4d, ...be16(42), ...be32(8), ...ifd, 0, 0, 0, 0];
  const exif = [...Buffer.from("Exif\0\0", "latin1"), ...tiff];
  return jpegOf(jpegSegment(0xe1, exif), jpegFrame(1, 1), jpegScan());
}
