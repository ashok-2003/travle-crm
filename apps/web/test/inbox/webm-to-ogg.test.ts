// @vitest-environment node
// The WebM-to-Ogg remux of a voice recording: the Opus packets come out untouched, in an Ogg file a decoder accepts (every page's
// checksum right, the OpusHead and OpusTags first, the granule position counting 48 kHz samples after the pre-skip, the last
// page ending the stream). The WebM is built by hand the way MediaRecorder writes one: a Segment and Clusters of unknown size.
import { describe, expect, it } from "vitest";
import { oggCrc, opusPacketsOf, opusSamplesIn, remuxWebmToOgg, RemuxError } from "@/inbox/voice/webm-to-ogg";

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const bytes = (...values: number[]) => Uint8Array.from(values);
/** An element with a one-byte size (content under 127 bytes) or an eight-byte one. */
function element(id: number[], content: Uint8Array): Uint8Array {
  if (content.length < 127) return concat(bytes(...id, 0x80 | content.length), content);
  const size = new Uint8Array(8);
  new DataView(size.buffer).setUint32(4, content.length);
  size[0] = 0x01;
  return concat(bytes(...id), size, content);
}
const unknownSize = (id: number[]) => bytes(...id, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);

/** An OpusHead for one channel at 48 kHz with this pre-skip. */
function opusHead(preSkip: number): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode("OpusHead"));
  head[8] = 1;
  head[9] = 1;
  new DataView(head.buffer).setUint16(10, preSkip, true);
  new DataView(head.buffer).setUint32(12, 48000, true);
  return head;
}

/** A 20 ms CELT fullband packet (config 31, one frame) of this length: its first byte is 0xf8. */
const packet = (length: number, fill: number) => concat(bytes(0xf8), new Uint8Array(length - 1).fill(fill));
const block = (frame: Uint8Array) => element([0xa3], concat(bytes(0x81, 0, 0, 0x80), frame));

function webmOf(packets: Uint8Array[], preSkip = 312): Uint8Array {
  const track = element(
    [0xae],
    concat(element([0x86], new TextEncoder().encode("A_OPUS")), element([0x63, 0xa2], opusHead(preSkip))),
  );
  return concat(
    element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x82], new TextEncoder().encode("webm"))),
    unknownSize([0x18, 0x53, 0x80, 0x67]),
    element([0x16, 0x54, 0xae, 0x6b], track),
    unknownSize([0x1f, 0x43, 0xb6, 0x75]),
    element([0xe7], bytes(0)),
    ...packets.map(block),
  );
}

interface Page {
  flags: number;
  granule: number;
  packets: Uint8Array[];
  checksumOk: boolean;
}

/** Reads an Ogg file back into its pages and their packets (every packet here ends within its page). */
function pagesOf(ogg: Uint8Array): Page[] {
  const pages: Page[] = [];
  let at = 0;
  while (at < ogg.length) {
    expect(new TextDecoder().decode(ogg.subarray(at, at + 4))).toBe("OggS");
    const view = new DataView(ogg.buffer, ogg.byteOffset + at);
    const segments = view.getUint8(26);
    const lacing = [...ogg.subarray(at + 27, at + 27 + segments)];
    const bodyLength = lacing.reduce((total, value) => total + value, 0);
    const length = 27 + segments + bodyLength;
    const whole = ogg.slice(at, at + length);
    const stored = new DataView(whole.buffer).getUint32(22, true);
    new DataView(whole.buffer).setUint32(22, 0, true);
    const packets: Uint8Array[] = [];
    let offset = at + 27 + segments;
    let current = 0;
    for (const value of lacing) {
      current += value;
      if (value < 255) {
        packets.push(ogg.slice(offset, offset + current));
        offset += current;
        current = 0;
      }
    }
    pages.push({
      flags: view.getUint8(5),
      granule: view.getUint32(6, true) + view.getUint32(10, true) * 2 ** 32,
      packets,
      checksumOk: oggCrc(whole) === stored,
    });
    at += length;
  }
  return pages;
}

describe("remuxWebmToOgg", () => {
  const sent = [packet(60, 1), packet(300, 2), packet(80, 3)];

  it("reads the Opus packets and the track's OpusHead out of a live WebM", () => {
    const { packets, head } = opusPacketsOf(webmOf(sent));
    expect(packets).toEqual(sent);
    expect(head).toEqual(opusHead(312));
  });

  it("writes an Ogg Opus stream: head, tags, then the packets, each page with its right checksum", () => {
    const pages = pagesOf(remuxWebmToOgg(webmOf(sent), 7));
    expect(pages.every((one) => one.checksumOk)).toBe(true);
    expect(new TextDecoder().decode(pages[0]?.packets[0]?.subarray(0, 8))).toBe("OpusHead");
    expect(pages[0]?.flags).toBe(0x02);
    expect(new TextDecoder().decode(pages[1]?.packets[0]?.subarray(0, 8))).toBe("OpusTags");
    expect(pages.slice(2).flatMap((one) => one.packets)).toEqual(sent);
    const last = pages.at(-1);
    expect(last?.flags).toBe(0x04);
    // Three 20 ms packets are 2,880 samples, after the 312 of pre-skip.
    expect(last?.granule).toBe(312 + 3 * 960);
  });

  it("splits a long recording over pages that hold under 255 segments, the granule growing", () => {
    const many = Array.from({ length: 700 }, (_, index) => packet(40, index % 250));
    const pages = pagesOf(remuxWebmToOgg(webmOf(many)));
    const audio = pages.slice(2);
    expect(audio.length).toBeGreaterThan(2);
    expect(audio.flatMap((one) => one.packets)).toHaveLength(700);
    expect(audio.map((one) => one.granule)).toEqual([...audio.map((one) => one.granule)].sort((a, b) => a - b));
    expect(pages.every((one) => one.checksumOk)).toBe(true);
  });

  it("counts a packet's samples from its table of contents", () => {
    expect(opusSamplesIn(bytes(0xf8))).toBe(960);
    expect(opusSamplesIn(bytes(0x08))).toBe(960);
    expect(opusSamplesIn(bytes(0xf9, 0))).toBe(1920);
    expect(opusSamplesIn(bytes(0xfb, 3))).toBe(2880);
  });

  it("refuses what is not a recording of Opus audio", () => {
    expect(() => remuxWebmToOgg(bytes(1, 2, 3))).toThrow(RemuxError);
    expect(() => remuxWebmToOgg(element([0x1a, 0x45, 0xdf, 0xa3], bytes(0x80)))).toThrow(RemuxError);
  });
});
