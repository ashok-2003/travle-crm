// The one agent's two read tools: what a customer's voice note says and what their photo shows; and a customer's photo or
// PDF read once as it arrives (read-on-arrival.ts). The worker reads the stored file, asks the agent's own model once
// (counted against the month), and keeps the words on the message for the inbox and later turns; kept words are reused,
// never paid for twice. Nothing here logs the words or the bytes.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Database } from "@travel-crm/db";
import type { AiMessage } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { Files } from "../../files/index.js";
import type { LoopIO } from "../natural/loop/types.js";
import { askingOf, IMAGE_SCHEMA, parsePhoto, type FileKind, type ReadText } from "./media-asking.js";

export interface MediaReadDependencies {
  db: Database;
  files: Files;
  call: LoopIO["call"];
  organizationId: string;
  /** A PDF's words (the worker's documentText); without it a PDF isn't read. */
  readText?: ReadText;
  /** Langfuse's prompts for the three readings; left out, the built-in texts. */
  prompts?: AiPrompts | undefined;
  /** Waits between looks at a file still being copied; tests pass a fake one. */
  sleep?: (ms: number) => Promise<void>;
}
/** `refused` is a sentence for the model, starting "refused: ". */
export type MediaRead = { ok: true; text: string } | { ok: false; refused: string };

const VOICE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PDF_MAX_BYTES = 10 * 1024 * 1024;
// The reply turn starts 3 s after the message, often before the file is copied: look again for a while before giving up.
const COPY_WAIT_MS = 15_000;
const COPY_LOOK_EVERY_MS = 1_500;
const SAVED_MAX_CHARACTERS = 2_000;

interface Way {
  kind: FileKind;
  textKind: "transcript" | "description";
  /** What this customer file is called in a refusal. */
  noun: string;
  /** The way on when the file can't be read. */
  askThem: string;
  maxBytes: number;
}
const voice: Way = {
  kind: "audio",
  textKind: "transcript",
  noun: "voice note",
  askThem: "ask them to type what they said",
  maxBytes: VOICE_MAX_BYTES,
};
const photo: Way = {
  kind: "image",
  textKind: "description",
  noun: "photo",
  askThem: "ask what it shows",
  maxBytes: IMAGE_MAX_BYTES,
};
const pdf: Way = {
  kind: "document",
  textKind: "description",
  noun: "PDF",
  askThem: "ask what it is",
  maxBytes: PDF_MAX_BYTES,
};

interface Input {
  conversationId: string;
  messageId: string;
}

const refuse = (text: string): MediaRead => ({ ok: false, refused: `refused: ${text}` });

export function transcribeVoiceNote(deps: MediaReadDependencies, input: Input): Promise<MediaRead> {
  return read(deps, input, voice, null);
}

export function lookAtImage(
  deps: MediaReadDependencies,
  input: Input & { question: string | null },
): Promise<MediaRead> {
  return read(deps, input, photo, input.question);
}

/** A customer's photo or PDF, read once as it arrives: its words kept as `lookAtImage` keeps a photo's. */
export function readArrivedFile(
  deps: MediaReadDependencies,
  input: Input & { kind: "image" | "document" },
): Promise<MediaRead> {
  return read(deps, input, input.kind === "image" ? photo : pdf, null);
}

async function read(
  {
    db,
    files,
    call,
    organizationId,
    readText,
    prompts,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  }: MediaReadDependencies,
  { conversationId, messageId }: Input,
  way: Way,
  question: string | null,
): Promise<MediaRead> {
  // Only a customer's own file in this chat: another chat's, our own and a sticker (kind "sticker") are not theirs to read.
  const look = () =>
    db.forOrg(organizationId, (tx) =>
      tx.whatsappMessage.findFirst({
        where: { id: messageId, conversationId, direction: "in", kind: way.kind },
        select: { aiText: true, mediaState: true },
      }),
    );
  let message = await look();
  for (let waited = 0; message?.mediaState === "pending" && message.aiText === null && waited < COPY_WAIT_MS;) {
    await sleep(COPY_LOOK_EVERY_MS);
    waited += COPY_LOOK_EVERY_MS;
    message = await look();
  }
  if (message === null) return refuse(`that isn't their ${way.noun}`);
  const kept = message.aiText;
  if (kept !== null && question === null) return { ok: true, text: textOf(way, kept, null) };

  const unreadable = (why: string) => refuse(`${why}; ${way.askThem}`);
  if (message.mediaState !== "stored") return unreadable("that file isn't kept (yet)");
  const file = await db.forOrg(organizationId, (tx) =>
    tx.attachment.findFirst({
      where: { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId, status: "ready" },
      select: { id: true, contentType: true, sizeBytes: true },
    }),
  );
  if (file === null) return unreadable("that file isn't kept (yet)");
  if (file.sizeBytes > way.maxBytes) return unreadable("that file is too big to read");
  const body = async () =>
    (
      await files.systemFile(organizationId, {
        recordType: WHATSAPP_RECORD_TYPE,
        recordId: messageId,
        attachmentId: file.id,
      })
    ).body;
  const asking = await askingOf(way.kind, file.contentType, body, question, readText, prompts);
  if (asking === null) return unreadable("that file's format can't be read");

  let found: { description: string; answer: string } | null;
  if ("kept" in asking) found = { description: asking.kept, answer: "" };
  else {
    const user: AiMessage = {
      role: "user",
      content: asking.user,
      ...(asking.attachments.length === 0 ? {} : { attachments: asking.attachments }),
    };
    const result = await call({
      feature: asking.feature,
      messages: [{ role: "system", content: asking.system }, user],
      ...(asking.prompt === undefined ? {} : { prompt: asking.prompt }),
      ...(way.kind === "audio" ? {} : { schema: IMAGE_SCHEMA }),
      maxTokens: 2_000,
      reasoning: { effort: "minimal" },
      timeoutMs: 60_000,
      user: organizationId,
    });
    if (!result.ok && result.reason === "limit") {
      return unreadable("this month's AI credits are used up");
    }
    if (!result.ok) found = null;
    else found = way.kind === "audio" ? { description: result.text.trim(), answer: "" } : parsePhoto(result.text);
  }
  if (found === null || found.description === "") {
    return unreadable(`it couldn't be ${way.kind === "audio" ? "played" : "seen"} just now`);
  }

  // Written once, in a transaction of its own: a second reader of the same file finds it written and reads that.
  const description = found.description;
  await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.updateMany({
      where: { id: messageId, aiText: null },
      data: { aiText: description.slice(0, SAVED_MAX_CHARACTERS), aiTextKind: way.textKind, aiTextAt: new Date() },
    }),
  );
  const saved = await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.findFirstOrThrow({ where: { id: messageId }, select: { aiText: true } }),
  );
  return { ok: true, text: textOf(way, saved.aiText ?? description, question === null ? null : found.answer) };
}

/** The tool's words: a voice note's transcript as it is; a photo's `seen: …` and, when asked, `answer: …`. */
function textOf(way: Way, kept: string, answer: string | null): string {
  if (way.kind === "audio") return kept;
  return answer === null || answer === "" ? `seen: ${kept}` : `seen: ${kept}\nanswer: ${answer}`;
}
