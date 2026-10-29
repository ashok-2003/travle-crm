// The message library's blanks (release 5, spec 3.5): the words in braces a saved message may hold, and the one
// function that fills them, used by the inbox, the lead page and the owner's preview, so they cannot disagree. A
// blank with no value stays as it is, for the person to type; a message with one left is not sent.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const blankNames = ["name", "destination", "month", "agent", "amount", "link"] as const;
export type BlankName = (typeof blankNames)[number];

const BLANK = /\{([a-z]+)\}/g;
const known: ReadonlySet<string> = new Set(blankNames);

/** The names between braces in the text, in order, each once. */
export function blanksIn(text: string): string[] {
  return [...new Set([...text.matchAll(BLANK)].flatMap((match) => match[1] ?? []))];
}

/** The blanks in the text that the library does not know: a typo, or one that is not offered. */
export function unknownBlanks(text: string): string[] {
  return blanksIn(text).filter((name) => !known.has(name));
}

/** The text with every blank that has a value filled in; one without a value stays as it was. */
export function fillBlanks(text: string, values: Partial<Record<BlankName, string>>): string {
  return text.replace(BLANK, (blank, name: string) => (known.has(name) ? (values[name as BlankName] ?? blank) : blank));
}

/** Whether the text still holds a blank to be typed in: such a message is not sent. */
export function hasOpenBlank(text: string): boolean {
  return blanksIn(text).length > 0;
}

/** A message body as the library saves it: its length, and only blanks it knows. */
export const libraryMessageBody = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((text) => unknownBlanks(text).length === 0, { message: "UNKNOWN_BLANK" });

/** Fills a message's blanks from one lead's facts (preview), or readies it for use (the quote's link is made). */
export const messageForLeadInput = z.strictObject({ leadId: recordId, text: z.string().max(4096) });
export type MessageForLeadInput = z.infer<typeof messageForLeadInput>;

export const filledMessage = z.object({
  text: z.string(),
  /** The blanks still in the text, which have no value for this lead yet (no quote, no destination). */
  open: z.array(z.string()),
});
export type FilledMessage = z.infer<typeof filledMessage>;
