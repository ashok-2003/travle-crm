// A PNG read chunk by chunk as png-js 2.0.0 reads it. React-PDF and pdfkit parse every logo with png-js, and size what
// they allocate from what it reads: width × height × the bit depth's bytes (png-js.cjs:180-182), after inflating every
// IDAT at once (:174). So a file png-js would read differently from its chunks' lengths is refused here, and the
// pixel data is counted as it inflates, never kept.
import { createInflate } from "node:zlib";

export interface PngImage {
  width: number;
  height: number;
  /** What the pixel data inflates to, filter bytes included, when it is the image the header describes. */
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

/** Adam7's seven passes, as png-js runs them: the first column and row, then the step across and down. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

const typeAt = (view: DataView, offset: number) =>
  String.fromCharCode(...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)));

/**
 * The PNG's header and pixel data, read to IEND, after the signature; null for a file png-js would read otherwise:
 * - an IHDR that isn't the first chunk, isn't 13 bytes (png-js reads 13 whatever the length says), or comes twice
 *   (each one replaces the size png-js decodes, png-js.cjs:47-50);
 * - a colour type, bit depth or interlace method PNG doesn't allow;
 * - a tRNS with an alpha channel's colour type (png-js reads none of its bytes, :68-95);
 * - a chunk running past the end (a length of 2^31 or more reads as negative in png-js), no IDAT, or no IEND.
 */
export function readPng(view: DataView): PngImage | null {
  let header: { width: number; height: number; colourType: number; bitsPerPixel: number; interlaced: boolean } | null =
    null;
  const pixelData: Uint8Array[] = [];
  for (let offset = 8; offset + 12 <= view.byteLength;) {
    const length = view.getUint32(offset);
    const type = typeAt(view, offset + 4);
    if (length > view.byteLength - offset - 12) return null;
    if (type === "IHDR") {
      const [bitDepth, colourType, , , interlace] = [16, 17, 18, 19, 20].map((at) => view.getUint8(offset + at));
      if (header !== null || offset !== 8 || length !== 13 || colourType === undefined) return null;
      if (!BIT_DEPTHS[colourType]?.includes(bitDepth ?? 0) || (interlace !== 0 && interlace !== 1)) return null;
      header = {
        width: view.getUint32(offset + 8),
        height: view.getUint32(offset + 12),
        colourType,
        bitsPerPixel: (bitDepth ?? 0) * (CHANNELS[colourType] ?? 0),
        interlaced: interlace === 1,
      };
    } else if (header === null || (type === "tRNS" && (header.colourType === 4 || header.colourType === 6))) {
      return null;
    } else if (type === "IDAT") {
      pixelData.push(new Uint8Array(view.buffer, view.byteOffset + offset + 8, length));
    } else if (type === "IEND") {
      if (pixelData.length === 0) return null;
      const { width, height, bitsPerPixel, interlaced } = header;
      const rows = (columns: number, count: number) =>
        columns <= 0 || count <= 0 ? 0 : count * (1 + Math.ceil((columns * bitsPerPixel) / 8));
      const pixelDataBytes = interlaced
        ? ADAM7.reduce(
            (sum, [x, y, dx, dy]) => sum + rows(Math.ceil((width - x) / dx), Math.ceil((height - y) / dy)),
            0,
          )
        : rows(width, height);
      return { width, height, pixelDataBytes, pixelData };
    }
    offset += 12 + length;
  }
  return null;
}

/**
 * Whether the pixel data inflates to no more than the header allows, and inflates at all. Counted as it inflates, a
 * chunk at a time, so a few kilobytes that would inflate to a gigabyte cost only the time to find out.
 */
export async function pngPixelDataFits(png: PngImage): Promise<boolean> {
  const inflate = createInflate();
  inflate.end(Buffer.concat(png.pixelData));
  let inflated = 0;
  try {
    for await (const chunk of inflate) {
      inflated += (chunk as Buffer).byteLength;
      if (inflated > png.pixelDataBytes) return false;
    }
    return true;
  } catch {
    // Not a zlib stream, or one cut short: png-js couldn't inflate it either.
    return false;
  } finally {
    inflate.destroy();
  }
}
