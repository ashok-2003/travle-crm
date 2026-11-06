// Payments to check: the one list a person works through, of every payment that waits for their word (a customer's claim, an
// AI booking's proof, a screenshot no booking waits for). Outputs only; the page shape is `useCursorPages`'.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

export const paymentToCheck = z.object({
  kind: z.enum(["claim", "ai_booking", "proof"]),
  id: recordId,
  createdAt: z.iso.datetime(),
  person: z.object({ name: z.string(), leadId: recordId.nullable() }),
  trip: z.string().nullable(),
  date: calendarDate.nullable(),
  /** What was asked, in paise; null when nothing says (a lone screenshot). */
  expectedPaise: z.int().nullable(),
  /** What the customer says they paid, in paise; null for a screenshot nobody has read. */
  claimedPaise: z.int().nullable(),
  reference: z.string().nullable(),
  /** claim_file: the claim's file (bookings files link); chat_message: a chat message (inbox media link). */
  screenshot: z.object({ kind: z.enum(["claim_file", "chat_message"]), id: recordId }).nullable(),
  conversationId: recordId.nullable(),
});
export type PaymentToCheck = z.infer<typeof paymentToCheck>;

export const paymentsToCheckPage = z.object({ items: z.array(paymentToCheck), nextCursor: z.string().nullable() });
export type PaymentsToCheckPage = z.infer<typeof paymentsToCheckPage>;

export const paymentsToCheckInput = z.strictObject({ cursor: z.string().max(100).optional() });
export type PaymentsToCheckInput = z.input<typeof paymentsToCheckInput>;
