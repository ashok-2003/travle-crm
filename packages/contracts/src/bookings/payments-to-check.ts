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
  /** What was asked, in paise (an instalment, or an advance code worked out); null when nothing says. */
  expectedPaise: z.int().nullable(),
  /** What the customer says they paid, in paise; null for a screenshot nobody has read. */
  claimedPaise: z.int().nullable(),
  /** An AI booking's amount as the AI wrote it down, when code worked out no advance: a note for the person, never a prefill. */
  aiNote: z.string().nullable(),
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

/** What a confirmation (of the amount typed so far) or a not found would tell the customer, before the person decides. */
export const paymentPreviewInput = z.strictObject({
  kind: z.enum(["claim", "ai_booking"]),
  id: recordId,
  outcome: z.enum(["confirm", "not_found"]),
  amountPaise: z.int().min(1).optional(),
});
export type PaymentPreviewInput = z.infer<typeof paymentPreviewInput>;

/** The words that would go as a message, or that a template or a task for a person would tell them instead. */
export const paymentPreview = z.discriminatedUnion("way", [
  z.object({ way: z.literal("message"), text: z.string() }),
  z.object({ way: z.literal("template") }),
  z.object({ way: z.literal("task") }),
]);
export type PaymentPreview = z.infer<typeof paymentPreview>;

/** The screenshot of one payment to check, by the record it waits on. */
export const paymentScreenshotInput = z.strictObject({ kind: z.enum(["claim", "ai_booking", "proof"]), id: recordId });
export type PaymentScreenshotInput = z.infer<typeof paymentScreenshotInput>;

/** A short-lived link to open it. */
export const paymentScreenshotLink = z.object({ url: z.string() });

export const dismissProofInput = z.strictObject({ proofId: recordId });
export type DismissProofInput = z.infer<typeof dismissProofInput>;

export const paymentDecision = z.object({ told: paymentTold });
export type PaymentDecision = z.infer<typeof paymentDecision>;

export const paymentsToCheckCount = z.object({ count: z.int() });
