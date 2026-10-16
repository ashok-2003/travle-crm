// What a logo's bytes really are, and how many pixels they hold. Storage checks only the type the browser declared,
// so a renamed file can arrive, and React-PDF silently leaves out an image it can't read. The size is read from the
// headers (PNG's chunks, as png-js reads them; JPEG's frame header) before anything decodes the image: a PNG of a few
// kilobytes can claim 16000×16000 pixels, or hold pixel data that inflates to a gigabyte, which pdfkit would allocate.
import { pngPixelDataFits, readPng } from "./png.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

export interface ImageHeader {
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

/** A start-of-frame marker: C0 to CF, but for DHT (C4), JPG (C8) and DAC (CC). */
const isStartOfFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

/** The JPEG's size from its first frame header, walking the segments before it; null without one before the scan. */
function jpegSize(view: DataView): Size | null {
  let offset = 2;
  while (offset + 2 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      // A fill byte before the marker.
      offset += 1;
      continue;
    }
    offset += 2;
    // Markers without a segment: TEM, the restarts and SOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // The end of the image, or its scan, before any frame header.
    if (marker === 0xd9 || marker === 0xda || offset + 2 > view.byteLength) return null;
    if (isStartOfFrame(marker)) {
      // The segment's length, its precision, then the height and the width.
      if (offset + 7 > view.byteLength) return null;
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    const length = view.getUint16(offset);
    if (length < 2) return null;
    offset += length;
  }
  return null;
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * A PNG or JPEG, from the file's own signature, with its width and height in pixels; null for anything else, for a
 * header cut short, for a PNG png-js would read otherwise (`readPng`), and for a size of zero (a JPEG whose height
 * comes later, in a DNL segment, included).
 */
export function imageOf(bytes: Uint8Array): ImageHeader | null {
  let header: ImageHeader | null = null;
  if (startsWith(bytes, PNG_SIGNATURE)) {
    const png = readPng(viewOf(bytes));
    header = png && { contentType: "image/png", width: png.width, height: png.height };
  } else if (startsWith(bytes, JPEG_SIGNATURE)) {
    const size = jpegSize(viewOf(bytes));
    header = size && { contentType: "image/jpeg", ...size };
  }
  return header && header.width > 0 && header.height > 0 ? header : null;
}

/**
 * Whether the image's pixel data is no more than its header says: a PNG's inflates to at most its rows' bytes,
 * counted without keeping them. A JPEG is drawn as it is stored (DCTDecode), so nothing inflates. Check the size
 * first: a header claiming a huge size allows huge pixel data.
 */
export async function pixelDataFitsHeader(bytes: Uint8Array): Promise<boolean> {
  if (!startsWith(bytes, PNG_SIGNATURE)) return imageOf(bytes) !== null;
  const png = readPng(viewOf(bytes));
  return png !== null && pngPixelDataFits(png);
}
