// The recording as the AI takes it: a 16 kHz mono 16-bit WAV, small enough for the two-minute limit.
import { describe, expect, it } from "vitest";
import { downsample, encodeWav, MAX_RECORDING_SECONDS, WAV_RATE, wavOf } from "@/ai/fill/wav";

const text = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

describe("the WAV encoding", () => {
  it("writes a 44-byte header and 16-bit little-endian mono samples at 16 kHz", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]));
    const view = new DataView(wav.buffer);
    expect(text(wav, 0, 4)).toBe("RIFF");
    expect(text(wav, 8, 12)).toBe("WAVE");
    expect(text(wav, 36, 40)).toBe("data");
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(WAV_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([44, 46, 48, 50].map((at) => view.getInt16(at, true))).toEqual([0, 32767, -32768, 16383]);
  });

  it("brings a 48 kHz recording down to 16 kHz by averaging, and leaves a slower one alone", () => {
    const samples = new Float32Array([0.3, 0.3, 0.3, -0.3, -0.3, -0.3]);
    const down = downsample(samples, 48_000);
    expect(down).toHaveLength(2);
    expect(down[0]).toBeCloseTo(0.3);
    expect(down[1]).toBeCloseTo(-0.3);
    expect(downsample(samples, 8000)).toBe(samples);
  });

  it("keeps two minutes under the 4 MB the api accepts", () => {
    const twoMinutes = new Float32Array(WAV_RATE * MAX_RECORDING_SECONDS);
    const blob = wavOf([twoMinutes], WAV_RATE);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + twoMinutes.length * 2);
    expect(blob.size).toBeLessThan(4 * 1024 * 1024);
  });
});
