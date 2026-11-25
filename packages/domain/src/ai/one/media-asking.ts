// What the model is asked about a customer's file (media.ts): a voice note heard, a photo seen, a PDF said in a line from
// its words. A PDF with no words (a scan) is kept as such with no call: nothing here turns a page into a picture.
import { audioFormatOf, type AiFeature, type AiPart } from "@travel-crm/integrations/ai";
import { fenced } from "../fenced.js";

/** The kinds of a customer's file the agent reads. */
export type FileKind = "audio" | "image" | "document";

/** A document's words, or null for a kind it can't read. */
export type ReadText = (bytes: Uint8Array, contentType: string) => Promise<string | null>;

export interface Asking {
  feature: AiFeature;
  system: string;
  user: string;
  attachments: AiPart[];
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PDF_TYPE = "application/pdf";
/** Enough of a PDF's words to say what it is: an ID card, a receipt, a list of names. */
const PDF_TEXT_CHARACTERS = 6_000;
/** What a PDF with no words to read is kept as. */
export const UNREADABLE_PDF = "a PDF with no readable text";

const VOICE_PROMPT =
  "Write exactly what is said in this WhatsApp voice note to an Indian travel company, in the language and script spoken (Hindi in Devanagari, Hinglish in Latin letters). Nothing else.";
const IMAGE_PROMPT =
  "Describe what this photo a customer sent an Indian travel company shows, in at most two sentences, copying any amounts, dates and names exactly. Then answer the question, if there is one.";
const PDF_PROMPT =
  "Say what this PDF a customer sent an Indian travel company is, from its text, in at most two sentences, copying any amounts, dates and names exactly (for example: an Aadhaar card of Asha Verma; a list of three travellers' names: Asha Verma, Ravi Verma, Neha Rao; a payment receipt for ₹6,000 on 25 Nov). Never copy an ID number. Then answer the question, if there is one.";
export const IMAGE_SCHEMA = {
  name: "photo_reading",
  jsonSchema: {
    type: "object",
    properties: { description: { type: "string" }, answer: { type: "string" } },
    required: ["description", "answer"],
    additionalProperties: false,
  },
};

/** The PDF's words, cut; empty for a scan or a file unpdf can't open (a broken or locked one). */
async function pdfWords(readText: ReadText, bytes: Uint8Array): Promise<string> {
  try {
    return ((await readText(bytes, PDF_TYPE)) ?? "").trim().slice(0, PDF_TEXT_CHARACTERS);
  } catch {
    return "";
  }
}

/**
 * What the model is asked of the file, its bytes fetched only for a type it reads; `kept` words when there is nothing to
 * ask (a PDF with no words); null for a type it can't read.
 */
export async function askingOf(
  kind: FileKind,
  contentType: string,
  body: () => Promise<Uint8Array>,
  question: string | null,
  readText: ReadText | undefined,
): Promise<Asking | { kept: string } | null> {
  const asks = question === null ? "No question." : `Question: ${question}`;
  if (kind === "audio") {
    const format = audioFormatOf(contentType);
    if (format === null) return null;
    const attachments: AiPart[] = [{ type: "audio", format, bytes: await body() }];
    return { feature: "agent_voice", system: VOICE_PROMPT, user: "Voice note.", attachments };
  }
  if (kind === "image") {
    const mimeType = IMAGE_TYPES.find((type) => type === contentType);
    if (mimeType === undefined) return null;
    const attachments: AiPart[] = [{ type: "image", mimeType, bytes: await body() }];
    return { feature: "agent_image", system: IMAGE_PROMPT, user: asks, attachments };
  }
  if (contentType !== PDF_TYPE || readText === undefined) return null;
  const words = await pdfWords(readText, await body());
  if (words === "") return { kept: UNREADABLE_PDF };
  return {
    feature: "agent_image",
    system: PDF_PROMPT,
    user: `${asks}\n\nThe PDF's text:\n<pdf>\n${fenced(words)}\n</pdf>`,
    attachments: [],
  };
}

export function parsePhoto(text: string): { description: string; answer: string } | null {
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
