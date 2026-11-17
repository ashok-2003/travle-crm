// The one agent's two read tools: what a customer's voice note says and what their photo shows. The worker reads the stored
// file, asks the agent's own model once (counted against the month), and keeps the words on the message for the inbox and
// later turns; kept words are reused, never paid for twice. Nothing here logs the words or the bytes.
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Database } from "@travel-crm/db";
import { audioFormatOf, type AiPart } from "@travel-crm/integrations/ai";
import type { Files } from "../../files/index.js";
import type { LoopIO } from "../natural/loop/types.js";

export interface MediaReadDependencies {
  db: Database;
  files: Files;
  call: LoopIO["call"];
  organizationId: string;
}
/** `refused` is a sentence for the model, starting "refused: ". */
export type MediaRead = { ok: true; text: string } | { ok: false; refused: string };

const VOICE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const SAVED_MAX_CHARACTERS = 2_000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const VOICE_PROMPT =
  "Write exactly what is said in this WhatsApp voice note to an Indian travel company, in the language and script spoken (Hindi in Devanagari, Hinglish in Latin letters). Nothing else.";
const IMAGE_PROMPT =
  "Describe what this photo a customer sent an Indian travel company shows, in at most two sentences, copying any amounts, dates and names exactly. Then answer the question, if there is one.";
const IMAGE_SCHEMA = {
  name: "photo_reading",
  jsonSchema: {
    type: "object",
    properties: { description: { type: "string" }, answer: { type: "string" } },
    required: ["description", "answer"],
    additionalProperties: false,
  },
};

interface Way {
  kind: "audio" | "image";
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

async function read(
  { db, files, call, organizationId }: MediaReadDependencies,
  { conversationId, messageId }: Input,
  way: Way,
  question: string | null,
): Promise<MediaRead> {
  // Only a customer's own file in this chat: another chat's, our own and a sticker (kind "sticker") are not theirs to read.
  const message = await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.findFirst({
      where: { id: messageId, conversationId, direction: "in", kind: way.kind },
      select: { aiText: true, mediaState: true },
    }),
  );
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
  const format = way.kind === "audio" ? audioFormatOf(file.contentType) : null;
  const imageType = IMAGE_TYPES.find((type) => type === file.contentType);
  if (way.kind === "audio" ? format === null : imageType === undefined) {
    return unreadable("that file's format can't be read");
  }

  const { body } = await files.systemFile(organizationId, {
    recordType: WHATSAPP_RECORD_TYPE,
    recordId: messageId,
    attachmentId: file.id,
  });
  const part: AiPart =
    format !== null
      ? { type: "audio", format, bytes: body }
      : { type: "image", mimeType: imageType ?? "image/jpeg", bytes: body };
  const result = await call({
    feature: "sales_agent",
    messages: [
      { role: "system", content: way.kind === "audio" ? VOICE_PROMPT : IMAGE_PROMPT },
      {
        role: "user",
        content: way.kind === "audio" ? "Voice note." : question === null ? "No question." : `Question: ${question}`,
        attachments: [part],
      },
    ],
    ...(way.kind === "image" ? { schema: IMAGE_SCHEMA } : {}),
    maxTokens: 2_000,
    reasoning: { effort: "minimal" },
    timeoutMs: 60_000,
    user: organizationId,
  });
  if (!result.ok && result.reason === "limit") {
    return unreadable("this month's AI calls are used up");
  }
  const couldNot = `it couldn't be ${way.kind === "audio" ? "played" : "seen"} just now`;
  if (!result.ok) return unreadable(couldNot);
  const found = way.kind === "audio" ? { description: result.text.trim(), answer: "" } : parsePhoto(result.text);
  if (found === null || found.description === "") return unreadable(couldNot);

  // Written once, in a transaction of its own: a second reader of the same file finds it written and reads that.
  await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.updateMany({
      where: { id: messageId, aiText: null },
      data: {
        aiText: found.description.slice(0, SAVED_MAX_CHARACTERS),
        aiTextKind: way.textKind,
        aiTextAt: new Date(),
      },
    }),
  );
  const saved = await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.findFirstOrThrow({ where: { id: messageId }, select: { aiText: true } }),
  );
  return { ok: true, text: textOf(way, saved.aiText ?? found.description, question === null ? null : found.answer) };
}

/** The tool's words: a voice note's transcript as it is; a photo's `seen: …` and, when asked, `answer: …`. */
function textOf(way: Way, kept: string, answer: string | null): string {
  if (way.kind === "audio") return kept;
  return answer === null || answer === "" ? `seen: ${kept}` : `seen: ${kept}\nanswer: ${answer}`;
}

function parsePhoto(text: string): { description: string; answer: string } | null {
  try {
    const json: unknown = JSON.parse(text);
    if (typeof json !== "object" || json === null) return null;
    const { description, answer } = json as Record<string, unknown>;
    if (typeof description !== "string") return null;
    return { description: description.trim(), answer: typeof answer === "string" ? answer.trim() : "" };
  } catch {
    return null;
  }
}
