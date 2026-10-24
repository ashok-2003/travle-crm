// Turns a browser's WebM recording of Opus audio into an Ogg file of the same Opus packets (nothing is decoded or encoded, so
// nothing is lost and it is quick). WhatsApp accepts voice notes as audio/ogg with Opus and refuses WebM, but Chrome and Edge
// can only record WebM. A small remuxer of our own, rather than a WASM encoder: about 200 lines, no dependency to pin or load,
// and tested here against a WebM built by hand. It reads what MediaRecorder writes (an EBML header, a Segment of unknown
// size, the track's OpusHead as its CodecPrivate, Clusters of SimpleBlocks); anything else is refused.

export class RemuxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemuxError";
  }
}

// EBML ids this reads. Masters are entered, not skipped, so an unknown size (a live recording's) needs no special case.
const ID = {
  segment: 0x18538067,
  cluster: 0x1f43b675,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  blockGroup: 0xa0,
  codecPrivate: 0x63a2,
  simpleBlock: 0xa3,
  block: 0xa1,
  codecId: 0x86,
} as const;
const MASTERS = new Set<number>([ID.segment, ID.cluster, ID.tracks, ID.trackEntry, ID.blockGroup]);

interface Header {
  id: number;
  /** Bytes the id and the size took. */
  headerLength: number;
  /** The content's length, or null when the size is "unknown". */
  size: number | null;
}

/** An element's id (its length marker kept, as the spec writes ids) and size at `at`. */
function headerAt(bytes: Uint8Array, at: number): Header {
  const first = bytes[at];
  if (first === undefined || first === 0) throw new RemuxError("not a WebM file");
  const idLength = Math.clz32(first) - 24 + 1;
  let id = 0;
  for (let index = 0; index < idLength; index += 1) id = id * 256 + (bytes[at + index] ?? 0);
  const sizeFirst = bytes[at + idLength];
  if (sizeFirst === undefined || sizeFirst === 0) throw new RemuxError("not a WebM file");
  const sizeLength = Math.clz32(sizeFirst) - 24 + 1;
  let size = sizeFirst & (0xff >> sizeLength);
  let allOnes = size === 0xff >> sizeLength;
  for (let index = 1; index < sizeLength; index += 1) {
    const byte = bytes[at + idLength + index] ?? 0;
    size = size * 256 + byte;
    allOnes &&= byte === 0xff;
  }
  return { id, headerLength: idLength + sizeLength, size: allOnes ? null : size };
}

/** The Opus packets of the file in order, and the track's OpusHead when it has one. */
export function opusPacketsOf(webm: Uint8Array): { packets: Uint8Array[]; head: Uint8Array | null } {
  const packets: Uint8Array[] = [];
  let head: Uint8Array | null = null;
  let codec = "";
  let at = 0;
  while (at < webm.length) {
    const element = headerAt(webm, at);
    const start = at + element.headerLength;
    if (MASTERS.has(element.id)) {
      at = start;
      continue;
    }
    if (element.size === null) throw new RemuxError("not a WebM file");
    const end = start + element.size;
    if (end > webm.length) break;
    if (element.id === ID.codecId) codec = new TextDecoder().decode(webm.subarray(start, end));
    else if (element.id === ID.codecPrivate) head = webm.subarray(start, end);
    else if (element.id === ID.simpleBlock || element.id === ID.block) {
      // Track number (a one-byte vint for the first tracks), a 16-bit time and the flags, then the frame.
      const trackLength = Math.clz32(webm[start] ?? 0x80) - 24 + 1;
      const flags = webm[start + trackLength + 2] ?? 0;
      if ((flags & 0x06) !== 0) throw new RemuxError("laced blocks are not supported");
      packets.push(webm.subarray(start + trackLength + 3, end));
    }
    at = end;
  }
  if (codec !== "" && codec !== "A_OPUS") throw new RemuxError("the recording is not Opus");
  if (packets.length === 0) throw new RemuxError("the recording holds no audio");
  return { packets, head };
}

/** Samples at 48 kHz in one Opus packet, from its table-of-contents byte (RFC 6716, section 3.1). */
export function opusSamplesIn(packet: Uint8Array): number {
  const toc = packet[0] ?? 0;
  const config = toc >> 3;
  const frameMs =
    config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 1) & 0x3f : 2;
  return Math.round((frameMs ?? 20) * 48 * frames);
}

// Ogg's CRC-32: polynomial 0x04c11db7, not reflected, starting at zero.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  return crc;
}

const BOS = 0x02;
const EOS = 0x04;

/** One Ogg page holding whole packets, with its granule position and checksum. */
function page(options: {
  flags: number;
  granule: number;
  serial: number;
  sequence: number;
  packets: Uint8Array[];
}): Uint8Array {
  const lacing: number[] = [];
  for (const packet of options.packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  const body = options.packets.reduce((total, packet) => total + packet.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, options.flags]);
  view.setUint32(6, options.granule >>> 0, true);
  view.setUint32(10, Math.floor(options.granule / 2 ** 32), true);
  view.setUint32(14, options.serial, true);
  view.setUint32(18, options.sequence, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let offset = 27 + lacing.length;
  for (const packet of options.packets) {
    out.set(packet, offset);
    offset += packet.length;
  }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

const text = (value: string) => new TextEncoder().encode(value);

function defaultHead(): Uint8Array {
  const head = new Uint8Array(19);
  head.set(text("OpusHead"));
  head[8] = 1;
  head[9] = 1;
  new DataView(head.buffer).setUint16(10, 312, true);
  new DataView(head.buffer).setUint32(12, 48000, true);
  return head;
}

/** The Opus audio of a WebM recording as an Ogg file. */
export function remuxWebmToOgg(webm: Uint8Array, serial: number = Math.floor(Math.random() * 2 ** 32)): Uint8Array {
  const { packets, head: found } = opusPacketsOf(webm);
  const head = found !== null && found.length >= 19 ? found : defaultHead();
  const preSkip = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
  const vendor = text("travel-crm");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(text("OpusTags"));
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  const pages: Uint8Array[] = [
    page({ flags: BOS, granule: 0, serial, sequence: 0, packets: [head] }),
    page({ flags: 0, granule: 0, serial, sequence: 1, packets: [tags] }),
  ];
  let samples = preSkip;
  let batch: Uint8Array[] = [];
  let segments = 0;
  let sequence = 2;
  const flush = (last: boolean) => {
    pages.push(page({ flags: last ? EOS : 0, granule: samples, serial, sequence, packets: batch }));
    sequence += 1;
    batch = [];
    segments = 0;
  };
  for (const [index, packet] of packets.entries()) {
    const needed = Math.floor(packet.length / 255) + 1;
    if (segments + needed > 250 && batch.length > 0) flush(false);
    batch.push(packet);
    segments += needed;
    samples += opusSamplesIn(packet);
    if (index === packets.length - 1) flush(true);
  }
  const out = new Uint8Array(pages.reduce((total, one) => total + one.length, 0));
  let offset = 0;
  for (const one of pages) {
    out.set(one, offset);
    offset += one.length;
  }
  return out;
}
