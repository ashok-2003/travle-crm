// A recording as the AI takes it: 16 kHz mono 16-bit WAV, encoded in the browser. Gemini's OpenAI-compatible endpoint reads
// only WAV and MP3 (checked 2026-10-30), while browsers record webm/opus (Chrome) or mp4/aac (Safari). Two minutes come to
// about 3.84 MB, under the 4 MB the api accepts.

export const WAV_RATE = 16_000;
export const MAX_RECORDING_SECONDS = 120;

/** Samples at `rate` brought down to 16 kHz by averaging each stretch of the longer recording (a rough low-pass). */
export function downsample(samples: Float32Array, rate: number): Float32Array {
  if (rate <= WAV_RATE) return samples;
  const ratio = rate / WAV_RATE;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let at = start; at < end; at += 1) sum += samples[at] ?? 0;
    out[index] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** The WAV file's bytes: a 44-byte header, then 16-bit little-endian samples. */
export function encodeWav(samples: Float32Array, rate: number = WAV_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, word: string) => {
    for (let index = 0; index < word.length; index += 1) view.setUint8(offset + index, word.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  });
  return bytes;
}

/** The pieces a recording arrived in, as one WAV file. */
export function wavOf(chunks: readonly Float32Array[], rate: number): Blob {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.length;
  }
  return new Blob([encodeWav(downsample(joined, rate)) as BlobPart], { type: "audio/wav" });
}
