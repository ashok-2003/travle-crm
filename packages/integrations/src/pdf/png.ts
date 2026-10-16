// A PNG read chunk by chunk as png-js 2.0.0 reads it. React-PDF and pdfkit parse every logo with png-js, and size what
// they allocate from what it reads: width × height × the bit depth's bytes (png-js.cjs:180-182), after inflating every
// IDAT at once (:174). So a file png-js would read differently from its chunks' lengths is refused here, and the
// pixel data is counted as it inflates, never kept. pdfkit has png-js decode the pixels of a PNG with alpha or with a
// palette's transparency (pdfkit.js:4821-4830), in a zlib callback whose two throws (png-js.cjs:176 and :284) nothing
// can catch: they stop the worker. So the pixel data is also checked for both.
import { createInflate } from "node:zlib";

export interface PngImage {
  width: number;
  height: number;
  /** One row of the pixel data: its filter byte, then its pixels' bytes. */
  rowBytes: number;
  /** What the pixel data inflates to, every row, when it is the image the header describes. */
  pixelDataBytes: number;
  /** The IDAT chunks' data, in order: png-js inflates them as one stream. */
  pixelData: Uint8Array[];
}

/** The bit depths PNG allows for each colour type (greyscale, truecolour, indexed, with alpha): png-js trusts any. */
const BIT_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** The filter types a row may start with (None, Sub, Up, Average, Paeth); png-js throws at any other (:284). */
const LAST_FILTER_TYPE = 4;

const typeAt = (view: DataView, offset: number) =>
  String.fromCharCode(...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)));

/**
 * The PNG's header and pixel data, read to IEND, after the signature; null for a file png-js would read otherwise, or
 * decode wrongly:
 * - an IHDR that isn't the first chunk, isn't 13 bytes (png-js reads 13 whatever the length says), or comes twice
 *   (each one replaces the size png-js decodes, png-js.cjs:47-50);
 * - a colour type or bit depth PNG doesn't allow;
 * - an interlaced file: png-js reads a filter byte even for an Adam7 pass with no columns (:187-195), so it takes the
 *   pixels of an image 4 pixels wide or narrower for filter types, and throws;
 * - a tRNS with an alpha channel's colour type (png-js reads none of its bytes, :68-95);
 * - a chunk running past the end (a length of 2^31 or more reads as negative in png-js), no IDAT, or no IEND.
 */
export function readPng(view: DataView): PngImage | null {
  let header: { width: number; height: number; colourType: number; bitsPerPixel: number } | null = null;
  const pixelData: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= view.byteLength;) {
    const length = view.getUint32(offset);
    const type = typeAt(view, offset + 4);
    if (length > view.byteLength - offset - 12) return null;
    if (type === "IHDR") {
      // The length first: the bytes below are inside the file only for a 13-byte IHDR.
      if (header !== null || offset !== 8 || length !== 13) return null;
      const [bitDepth = 0, colourType = -1, , , interlace] = [16, 17, 18, 19, 20].map((at) =>
        view.getUint8(offset + at),
      );
      if (!BIT_DEPTHS[colourType]?.includes(bitDepth) || interlace !== 0) return null;
      header = {
        width: view.getUint32(offset + 8),
        height: view.getUint32(offset + 12),
        colourType,
        bitsPerPixel: bitDepth * (CHANNELS[colourType] ?? 0),
      };
    } else if (header === null || (type === "tRNS" && (header.colourType === 4 || header.colourType === 6))) {
      return null;
    } else if (type === "IDAT") {
      pixelData.push(new Uint8Array(view.buffer, view.byteOffset + offset + 8, length));
    } else if (type === "IEND") {
      if (pixelData.length === 0) return null;
      const { width, height, bitsPerPixel } = header;
      // As png-js reads a row: its filter byte, then ceil(width × bits per pixel / 8) bytes (:189-198).
      const rowBytes = 1 + Math.ceil((width * bitsPerPixel) / 8);
      return { width, height, rowBytes, pixelDataBytes: rowBytes * height, pixelData };
    }
    offset += 12 + length;
  }
  return null;
}

/**
 * Whether the pixel data inflates at all (png-js throws on a zlib error, :176), to no more than the header's rows, and
 * with every row png-js reads starting with a filter type it knows (it throws on any other, :284). Counted as it
 * inflates, a chunk at a time, so a few kilobytes that would inflate to a gigabyte cost only the time to find out.
 */
export async function pngPixelDataFits(png: PngImage): Promise<boolean> {
  const inflate = createInflate();
  inflate.end(Buffer.concat(png.pixelData));
  let inflated = 0;
  // png-js reads a filter byte at every row start inside the data, the last row's too if it is cut short.
  let nextRow = 0;
  try {
    for await (const chunk of inflate) {
      const bytes = chunk as Buffer;
      if (inflated + bytes.byteLength > png.pixelDataBytes) return false;
      for (; nextRow < inflated + bytes.byteLength; nextRow += png.rowBytes) {
        if ((bytes[nextRow - inflated] ?? 0) > LAST_FILTER_TYPE) return false;
      }
      inflated += bytes.byteLength;
    }
    return true;
  } catch {
    // Not a zlib stream, or one cut short: png-js couldn't inflate it either.
    return false;
  } finally {
    inflate.destroy();
  }
}
