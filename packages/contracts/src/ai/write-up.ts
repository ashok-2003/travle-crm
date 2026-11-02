// The quote write-up (release ai2b): a message for the customer about a quote, in English or Hindi, for WhatsApp or email,
// in the agency's chosen style. Amounts and the link are filled by code from the quote, never typed by the model.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const writeStyles = ["warm", "premium", "short"] as const;
export const writeStyle = z.enum(writeStyles);
export type WriteStyle = z.infer<typeof writeStyle>;

export const writeUpLanguages = ["en", "hi"] as const;
export const writeUpChannels = ["whatsapp", "email"] as const;

export const writeUpInput = z.strictObject({
  quoteId: recordId,
  language: z.enum(writeUpLanguages),
  channel: z.enum(writeUpChannels),
});
export type WriteUpInput = z.infer<typeof writeUpInput>;

export const writeUp = z.object({
  /** The message, with the quote's total and advance filled in by code. `{link}` stays where the quote's link goes. */
  text: z.string(),
  /** The quote's `updatedAt` when this was written: the screen says "The quote changed" once it differs. */
  quoteUpdatedAt: z.iso.datetime(),
  /** True when an amount the model typed itself was taken out. */
  removedAmounts: z.boolean(),
  /** The customer's open chat the member may put the message in, with the draft that audits it when sent. */
  chat: z.strictObject({ conversationId: recordId, draftId: recordId }).nullable(),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type WriteUp = z.infer<typeof writeUp>;
