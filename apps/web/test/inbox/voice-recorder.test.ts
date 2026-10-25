// @vitest-environment node
// Recording a voice note, with a fake MediaRecorder: the type WhatsApp takes is picked first, a WebM-only browser's recording is
// remuxed to Ogg, the microphone is asked for only when recording starts and its refusal is named, a recording ends itself at five
// minutes, cancelling keeps nothing, and a file over 16 MB is refused.
import { MAX_WHATSAPP_SEND_BYTES } from "@travel-crm/contracts/inbox";
import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_MS,
  pickVoiceFormat,
  startVoiceRecording,
  VoiceError,
  type RecorderLike,
  type VoiceDependencies,
} from "@/inbox/voice/voice-recorder";

class FakeRecorder implements RecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  started = false;
  stopped = 0;
  constructor(
    readonly mimeType: string,
    private readonly data: Uint8Array,
  ) {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped += 1;
    this.ondataavailable?.({ data: new Blob([this.data as BlobPart]) });
    this.onstop?.();
  }
}

function setup(options: { supported: string[]; data?: Uint8Array; denied?: string }) {
  let clock = 1_000;
  let limit: (() => void) | null = null;
  let released = 0;
  const asked: string[] = [];
  const created: FakeRecorder[] = [];
  const deps: VoiceDependencies = {
    getUserMedia: () => {
      asked.push("microphone");
      if (options.denied !== undefined) return Promise.reject(Object.assign(new Error("x"), { name: options.denied }));
      return Promise.resolve({ getTracks: () => [{ stop: () => (released += 1) }] });
    },
    createRecorder: (_stream, mimeType) => {
      const recorder = new FakeRecorder(mimeType, options.data ?? new Uint8Array([1, 2, 3]));
      created.push(recorder);
      return recorder;
    },
    isTypeSupported: (type) => options.supported.includes(type),
    now: () => clock,
    after: (_ms, callback) => {
      limit = callback;
      return () => {
        limit = null;
      };
    },
  };
  return {
    deps,
    asked,
    created,
    advance: (ms: number) => (clock += ms),
    hitLimit: () => limit?.(),
    released: () => released,
  };
}

describe("voice notes", () => {
  it("prefers Ogg Opus, then MP4, and uses WebM only when nothing else is there", () => {
    expect(pickVoiceFormat(() => true)?.sentType).toBe("audio/ogg");
    expect(pickVoiceFormat((type) => type === "audio/mp4")?.extension).toBe("m4a");
    expect(pickVoiceFormat((type) => type === "audio/webm;codecs=opus")).toMatchObject({
      remux: true,
      sentType: "audio/ogg",
    });
    expect(pickVoiceFormat(() => false)).toBeNull();
  });

  it("asks for the microphone only when recording starts, and gives the file as the browser wrote it when it is Ogg or MP4", async () => {
    const test = setup({ supported: ["audio/mp4"], data: new Uint8Array([9, 9, 9, 9]) });
    expect(test.asked).toEqual([]);
    const recording = await startVoiceRecording(test.deps, () => undefined);
    expect(test.asked).toEqual(["microphone"]);
    test.advance(7_000);
    expect(recording.elapsedMs()).toBe(7_000);
    const file = await recording.finish();
    expect(file).toMatchObject({ name: "voice-note.m4a", type: "audio/mp4", size: 4 });
    expect(test.released()).toBe(1);
  });

  it("remuxes a WebM recording to Ogg, and refuses one that is not Opus audio", async () => {
    const test = setup({ supported: ["audio/webm;codecs=opus"], data: new Uint8Array([1, 2, 3]) });
    const recording = await startVoiceRecording(test.deps, () => undefined);
    await expect(recording.finish()).rejects.toThrow();
  });

  it("names why the microphone was not given", async () => {
    await expect(
      startVoiceRecording(setup({ supported: ["audio/mp4"], denied: "NotAllowedError" }).deps, () => undefined),
    ).rejects.toMatchObject({ problem: "denied" });
    await expect(
      startVoiceRecording(setup({ supported: ["audio/mp4"], denied: "NotFoundError" }).deps, () => undefined),
    ).rejects.toMatchObject({ problem: "no_microphone" });
    await expect(startVoiceRecording(setup({ supported: [] }).deps, () => undefined)).rejects.toMatchObject({
      problem: "unsupported",
    });
  });

  it("stops by itself at five minutes, and says so", async () => {
    const test = setup({ supported: ["audio/mp4"] });
    let told = 0;
    const recording = await startVoiceRecording(test.deps, () => (told += 1));
    test.advance(MAX_VOICE_MS + 30_000);
    test.hitLimit();
    expect(told).toBe(1);
    expect(recording.elapsedMs()).toBe(MAX_VOICE_MS);
    expect(test.created[0]?.stopped).toBe(1);
    await recording.finish();
    expect(test.created[0]?.stopped).toBe(1);
  });

  it("keeps nothing when cancelled, and lets the microphone go", async () => {
    const test = setup({ supported: ["audio/mp4"] });
    const recording = await startVoiceRecording(test.deps, () => undefined);
    recording.cancel();
    expect(test.released()).toBe(1);
    expect(test.created[0]?.ondataavailable).toBeNull();
  });

  it("refuses a recording over WhatsApp's 16 MB, and an empty one", async () => {
    const big = setup({ supported: ["audio/mp4"], data: new Uint8Array(MAX_WHATSAPP_SEND_BYTES + 1) });
    await expect((await startVoiceRecording(big.deps, () => undefined)).finish()).rejects.toMatchObject({
      problem: "too_big",
    });
    const none = setup({ supported: ["audio/mp4"], data: new Uint8Array(0) });
    await expect((await startVoiceRecording(none.deps, () => undefined)).finish()).rejects.toBeInstanceOf(VoiceError);
  });
});
