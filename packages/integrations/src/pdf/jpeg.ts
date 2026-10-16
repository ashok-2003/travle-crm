// A JPEG as it is drawn: only the segments that draw it, in a layout React-PDF's parser reads as JPEG does. React-PDF
// (@react-pdf/image) walks every marker with jay-peg 1.1.1 in the worker, and jay-peg's EXIF reader trusts each
// entry's component count (markers/exif.js:177-178, 227-232): a JPEG of 65 bytes costs it 460 MB, a hundred bytes
// kill the process out of memory, and a string value of NULs runs a backtracking regex (:164, :166). So the logo is
// drawn without any metadata (EXIF, XMP, ICC, comments), which nothing needs to draw it.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DQT = 0xdb;
const DHT = 0xc4;
const DRI = 0xdd;
/** Adobe's APP14: whether the scan is YCbCr or CMYK, which a PDF viewer needs to draw the colours right. */
const ADOBE = 0xee;

/** A start-of-frame marker: C0 to CF, but for DHT (C4), JPG (C8) and DAC (CC). */
export const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

/** Each kept segment's length, as jay-peg reads it, given its first bytes: it ignores the length for these. */
function lengthJayPegReads(marker: number, segment: Uint8Array): number | null {
  if (isStartOfFrame(marker)) return 8 + 3 * (segment[7] ?? 0);
  if (marker === SOS) return 6 + 2 * (segment[2] ?? 0);
  if (marker === DRI) return 4;
  // 8-bit tables of 65 bytes each, which is all jay-peg reads (markers/dqt.js).
  if (marker === DQT) return (segment.byteLength - 2) % 65 === 0 ? segment.byteLength : null;
  return segment.byteLength;
}

/**
 * The JPEG with only SOI, its tables (DQT, DHT, DRI), Adobe's colour transform, its frame and its scans, then EOI:
 * fill bytes and every other segment (APPn but Adobe's, COM, DNL, DAC and the like) left out, and nothing after EOI.
 * A file that ends inside its last scan gets its EOI, as browsers and pdfkit draw it anyway. Null for anything else:
 * no frame before the first scan, a second frame, a segment past the end or of a length jay-peg reads otherwise (it
 * would read the next marker from inside this one), a restart marker outside a scan, or no scan at all.
 */
export function jpegForDrawing(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let framed = false;
  let scanned = false;
  const drawing = () => (scanned ? new Uint8Array(Buffer.concat(kept)) : null);
  let offset = 2;
  while (offset < bytes.byteLength) {
    // Fill bytes before a marker.
    while (bytes[offset] === 0xff && bytes[offset + 1] === 0xff) offset += 1;
    if (bytes[offset] !== 0xff || offset + 2 > bytes.byteLength) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === EOI) {
      kept.push(bytes.subarray(offset, offset + 2));
      return drawing();
    }
    // TEM stands alone; a restart marker belongs inside a scan.
    if (marker === 0x01) {
      offset += 2;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd8) || offset + 4 > bytes.byteLength) return null;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > bytes.byteLength) return null;
    const segment = bytes.subarray(offset + 2, offset + 2 + length);
    let end = offset + 2 + length;
    const drawn = isStartOfFrame(marker) || [DQT, DHT, DRI, ADOBE, SOS].includes(marker);
    if (drawn && lengthJayPegReads(marker, segment) !== length) return null;
    if (isStartOfFrame(marker)) {
      // One frame: jay-peg, pdfkit and imageOf each take the first's size.
      if (framed) return null;
      framed = true;
    }
    if (marker === SOS) {
      if (!framed) return null;
      scanned = true;
      // The scan's data runs to the next marker (an 0xFF followed by neither a stuffed 0x00 nor a restart), or to the
      // end of a file cut short.
      while (end < bytes.byteLength) {
        const next = bytes[end + 1];
        if (bytes[end] === 0xff && next !== undefined && next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        end += 1;
      }
    }
    if (drawn) kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  // The file ended inside a scan, or after a segment: its EOI, so jay-peg ends there too rather than reading on.
  kept.push(Uint8Array.of(0xff, EOI));
  return drawing();
}
