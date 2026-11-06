// Payments to check: the one list a person works through, of every payment that waits for their word (a customer's claim, an
// AI booking's proof, a screenshot no booking waits for), ordered by when each record was created (its id), not by
// waitingSince. The cursor is the last id shown. Outputs only; the page shape is `useCursorPages`'. A person's decision
// (confirm, refuse, dismiss) comes with how the customer was then told.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { rejectReason } from "./bookings.js";

export const paymentToCheck = z.object({
  kind: z.enum(["claim", "ai_booking", "proof"]),
  id: recordId,
  createdAt: z.iso.datetime(),
  /** When it started waiting for a person: an AI booking's latest proof message, else the record's own creation. */
  waitingSince: z.iso.datetime(),
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
  /** A claim's booking: the record its screenshot file is kept under. Null for the other kinds. */
  bookingId: recordId.nullable(),
});
export type PaymentToCheck = z.infer<typeof paymentToCheck>;

export const paymentsToCheckPage = z.object({ items: z.array(paymentToCheck), nextCursor: z.string().nullable() });
export type PaymentsToCheckPage = z.infer<typeof paymentsToCheckPage>;

export const paymentsToCheckInput = z.strictObject({ cursor: recordId.optional() });
export type PaymentsToCheckInput = z.input<typeof paymentsToCheckInput>;

export const paymentTold = z.enum(["sent", "template", "task", "none"]);
export type PaymentTold = z.infer<typeof paymentTold>;

/** Confirm: the amount is the person's entry (prefilled with what was expected); the reference is the bank's, if any. */
export const confirmPaymentInput = z.strictObject({
  kind: z.enum(["claim", "ai_booking"]),
  id: recordId,
  amountPaise: z.int().min(1),
  // Only an AI booking's payment takes this; a claim keeps the reference its customer gave.
  reference: z.string().max(60),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentInput>;

/** Refuse: `tell` says whether the customer hears it wasn't found. */
export const refusePaymentInput = z.strictObject({
  kind: z.enum(["claim", "ai_booking"]),
  id: recordId,
  reason: rejectReason,
  tell: z.boolean(),
});
export type RefusePaymentInput = z.infer<typeof refusePaymentInput>;

export const dismissProofInput = z.strictObject({ proofId: recordId });
export type DismissProofInput = z.infer<typeof dismissProofInput>;

export const paymentDecision = z.object({ told: paymentTold });
export type PaymentDecision = z.infer<typeof paymentDecision>;

export const paymentsToCheckCount = z.object({ count: z.int() });
