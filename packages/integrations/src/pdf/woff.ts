// Unpacks a WOFF 1.0 font into the TrueType (SFNT) file it compresses. fontkit 2.0.4, which React-PDF uses, reads a
// WOFF's tables as separate buffers and then overruns one when a font ends with an empty glyph (IBM Plex Mono's
// space), and it can't subset WOFF2 at all. A plain TrueType file avoids both.
import { inflateSync } from "node:zlib";

const WOFF_SIGNATURE = 0x774f4646; // "wOFF"
const WOFF_HEADER_SIZE = 44;
const WOFF_TABLE_ENTRY_SIZE = 20;
const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_RECORD_SIZE = 16;

interface Table {
  tag: number;
  checksum: number;
  data: Uint8Array;
}

/** Inflates one table, never to more than the length it declares. */
function unpacked(stored: Uint8Array, length: number): Uint8Array {
  try {
    return new Uint8Array(inflateSync(stored, { maxOutputLength: length }));
  } catch {
    throw new RangeError("A WOFF table unpacks to more than it declares, or is damaged");
  }
}

const paddedToFour = (length: number): number => (length + 3) & ~3;

export function sfntFromWoff(woff: Uint8Array): Uint8Array {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (woff.byteLength < WOFF_HEADER_SIZE || view.getUint32(0) !== WOFF_SIGNATURE) {
    throw new RangeError("Not a WOFF font");
  }
  const flavor = view.getUint32(4);
  const tableCount = view.getUint16(12);
  const totalSfntSize = view.getUint32(16);
  if (tableCount === 0) throw new RangeError("A WOFF font with no tables");

  const tables: Table[] = [];
  let declaredTotal = SFNT_HEADER_SIZE + tableCount * SFNT_TABLE_RECORD_SIZE;
  for (let index = 0; index < tableCount; index++) {
    const entry = WOFF_HEADER_SIZE + index * WOFF_TABLE_ENTRY_SIZE;
    if (entry + WOFF_TABLE_ENTRY_SIZE > woff.byteLength) throw new RangeError("A truncated WOFF font");
    const offset = view.getUint32(entry + 4);
    const compressedLength = view.getUint32(entry + 8);
    const length = view.getUint32(entry + 12);
    declaredTotal += paddedToFour(length);
    if (declaredTotal > totalSfntSize) throw new RangeError("WOFF tables larger than the font's declared size");
    if (offset + compressedLength > woff.byteLength) throw new RangeError("A truncated WOFF font");
    const stored = woff.subarray(offset, offset + compressedLength);
    // A table is stored as is when compressing it wouldn't make it smaller.
    const data = compressedLength < length ? unpacked(stored, length) : stored;
    if (data.byteLength !== length) throw new RangeError("A WOFF table unpacked to the wrong size");
    tables.push({ tag: view.getUint32(entry), checksum: view.getUint32(entry + 16), data });
  }
  // TrueType wants its table records sorted by tag.
  tables.sort((first, second) => first.tag - second.tag);

  const directorySize = SFNT_HEADER_SIZE + tableCount * SFNT_TABLE_RECORD_SIZE;
  const size = tables.reduce((total, table) => total + paddedToFour(table.data.byteLength), directorySize);
  const sfnt = new Uint8Array(size);
  const out = new DataView(sfnt.buffer);

  // The search fields are derived from the table count, as the OpenType specification defines them.
  const entrySelector = Math.floor(Math.log2(tableCount));
  const searchRange = 2 ** entrySelector * SFNT_TABLE_RECORD_SIZE;
  out.setUint32(0, flavor);
  out.setUint16(4, tableCount);
  out.setUint16(6, searchRange);
  out.setUint16(8, entrySelector);
  out.setUint16(10, tableCount * SFNT_TABLE_RECORD_SIZE - searchRange);

  let offset = directorySize;
  tables.forEach((table, index) => {
    const record = SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE;
    out.setUint32(record, table.tag);
    out.setUint32(record + 4, table.checksum);
    out.setUint32(record + 8, offset);
    out.setUint32(record + 12, table.data.byteLength);
    sfnt.set(table.data, offset);
    offset += paddedToFour(table.data.byteLength);
  });
  return sfnt;
}
