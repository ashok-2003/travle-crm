// Recording a voice note in the browser (spec 4.4 S4, the owner's addition of 2026-10-24): MediaRecorder on the microphone, in
// the type WhatsApp takes where the browser can write one (Ogg Opus, then MP4), else WebM Opus remuxed into Ogg (webm-to-ogg.ts).
// Microphone permission is asked for when recording starts, never before. A recording stops itself at five minutes, and a file
// over WhatsApp's 16 MB is refused. The browser's parts are passed in, so the logic runs under test with a fake recorder.
import { MAX_WHATSAPP_SEND_BYTES } from "@travel-crm/contracts/inbox";
import { remuxWebmToOgg } from "./webm-to-ogg";

/** The longest a voice note may be. */
export const MAX_VOICE_MS = 5 * 60_000;

export type VoiceProblem = "denied" | "no_microphone" | "unsupported" | "too_big" | "empty";

export class VoiceError extends Error {
  readonly problem: VoiceProblem;
  constructor(problem: VoiceProblem) {
    super(problem);
    this.name = "VoiceError";
    this.problem = problem;
  }
}

/** What to record in and what the file is: the recorder's type, and the type and extension of what is sent. */
export interface VoiceFormat {
  recorderType: string;
  sentType: "audio/ogg" | "audio/mp4";
  extension: "ogg" | "m4a";
  /** WebM Opus, to be remuxed into Ogg when it stops. */
  remux: boolean;
}

const formats: readonly VoiceFormat[] = [
  { recorderType: "audio/ogg;codecs=opus", sentType: "audio/ogg", extension: "ogg", remux: false },
  { recorderType: "audio/mp4", sentType: "audio/mp4", extension: "m4a", remux: false },
  { recorderType: "audio/webm;codecs=opus", sentType: "audio/ogg", extension: "ogg", remux: true },
];

/** The first format the browser can record: WhatsApp's own types before the one that has to be converted. */
export function pickVoiceFormat(isSupported: (type: string) => boolean): VoiceFormat | null {
  return formats.find((format) => isSupported(format.recorderType)) ?? null;
}

/** The part of MediaRecorder this uses. */
export interface RecorderLike {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
}

export interface VoiceDependencies {
  getUserMedia: (constraints: { audio: true }) => Promise<MediaStreamLike>;
  createRecorder: (stream: MediaStreamLike, mimeType: string) => RecorderLike;
  isTypeSupported: (type: string) => boolean;
  now: () => number;
  /** Runs `callback` once after `ms` and returns what cancels it. */
  after: (ms: number, callback: () => void) => () => void;
}

export interface MediaStreamLike {
  getTracks(): { stop(): void }[];
}

export interface VoiceRecording {
  /** Milliseconds recorded so far. */
  elapsedMs(): number;
  /** Ends the recording and gives the file. */
  finish(): Promise<File>;
  /** Throws the recording away. */
  cancel(): void;
}

/** Asks for the microphone and starts recording. `onLimit` is told when the five minutes end it: the person is then to be asked to send. */
export async function startVoiceRecording(deps: VoiceDependencies, onLimit: () => void): Promise<VoiceRecording> {
  const format = pickVoiceFormat(deps.isTypeSupported);
  if (format === null) throw new VoiceError("unsupported");
  let stream: MediaStreamLike;
  try {
    stream = await deps.getUserMedia({ audio: true });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new VoiceError(name === "NotFoundError" || name === "OverconstrainedError" ? "no_microphone" : "denied");
  }
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  const recorder = deps.createRecorder(stream, format.recorderType);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const started = deps.now();
  let ended: number | null = null;
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => {
      resolve();
    };
    recorder.onerror = () => {
      resolve();
    };
  });
  let stopRequested = false;
  const stopRecorder = () => {
    if (stopRequested) return;
    stopRequested = true;
    recorder.stop();
  };
  recorder.start(1000);
  const cancelLimit = deps.after(MAX_VOICE_MS, () => {
    ended ??= deps.now();
    stopRecorder();
    onLimit();
  });
  return {
    elapsedMs: () => Math.min((ended ?? deps.now()) - started, MAX_VOICE_MS),
    async finish() {
      cancelLimit();
      ended ??= deps.now();
      stopRecorder();
      await stopped;
      release();
      const recorded = new Blob(chunks, { type: format.recorderType });
      if (recorded.size === 0) throw new VoiceError("empty");
      const body = format.remux ? remuxWebmToOgg(new Uint8Array(await recorded.arrayBuffer())) : recorded;
      const file = new File([body as BlobPart], `voice-note.${format.extension}`, { type: format.sentType });
      if (file.size > MAX_WHATSAPP_SEND_BYTES) throw new VoiceError("too_big");
      return file;
    },
    cancel() {
      cancelLimit();
      recorder.ondataavailable = null;
      stopRecorder();
      release();
    },
  };
}

/** The browser's own parts, or null where there is no microphone to ask for. */
export function browserVoiceDependencies(): VoiceDependencies | null {
  // Without https (or a microphone API at all) the browser has no mediaDevices.
  if (typeof MediaRecorder === "undefined" || !("mediaDevices" in navigator)) return null;
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createRecorder: (stream, mimeType) => new MediaRecorder(stream as MediaStream, { mimeType }) as RecorderLike,
    isTypeSupported: (type) => MediaRecorder.isTypeSupported(type),
    now: () => Date.now(),
    after: (ms, callback) => {
      const timer = setTimeout(callback, ms);
      return () => {
        clearTimeout(timer);
      };
    },
  };
}
