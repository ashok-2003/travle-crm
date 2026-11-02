// The console's failed emails (the owner, 2026-11-02; the failed-emails spec): every email the product sends is kept as
// sent, and super admins list the ones that failed in the last 30 days, open one as it was sent, links included, and
// send it again. Super admins only: the rows hold working reset and invite links.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const emailStatuses = ["sending", "sent", "failed"] as const;
export const emailStatus = z.enum(emailStatuses);
export type EmailStatus = z.infer<typeof emailStatus>;

/** Where it failed: our own send (smtp), or Brevo's report after accepting it (provider). */
export const emailFailureSources = ["smtp", "provider"] as const;
export const emailFailureSource = z.enum(emailFailureSources);
export type EmailFailureSource = z.infer<typeof emailFailureSource>;

/** The failed list shows the provider's reason cut to this many characters; the email's page shows all of it. */
export const SHORT_FAILURE_REASON_LENGTH = 200;

/** One page of the failed list, newest first; the next page starts after the given email. */
export const listFailedEmailsInput = z.strictObject({
  /** The id of the last email of the previous page. */
  cursor: recordId.optional(),
  limit: z.int().min(1).max(100).default(25),
});
export type ListFailedEmailsInput = z.infer<typeof listFailedEmailsInput>;

const failure = {
  failureSource: emailFailureSource,
  /** Ours: the adapter's code, e.g. "EAUTH (SMTP 535)". The provider's: its event, e.g. "hard_bounce". */
  failureCode: z.string(),
  failedAt: z.iso.datetime(),
};

export const failedEmail = z.object({
  id: recordId,
  createdAt: z.iso.datetime(),
  toAddress: z.string(),
  toName: z.string().nullable(),
  subject: z.string(),
  /** What sent it: "notification", "password-reset", "staff-invite", "platform-incident"... */
  purpose: z.string(),
  ...failure,
  /** The provider's reason, cut to SHORT_FAILURE_REASON_LENGTH characters; null for our own failures. */
  failureReason: z.string().nullable(),
  /** Whether a resend of it was later sent. */
  resent: z.boolean(),
});
export type FailedEmail = z.infer<typeof failedEmail>;

export const failedEmailsPage = z.object({
  emails: z.array(failedEmail),
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type FailedEmailsPage = z.infer<typeof failedEmailsPage>;

export const emailIdInput = z.strictObject({ id: recordId });
export type EmailIdInput = z.infer<typeof emailIdInput>;

/** A resend of an email, as its page lists them, oldest first. */
export const emailResend = z.object({
  id: recordId,
  status: emailStatus,
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  failedAt: z.iso.datetime().nullable(),
  failureCode: z.string().nullable(),
});
export type EmailResend = z.infer<typeof emailResend>;

/** One email exactly as it was sent, with how it went and its resends. */
export const storedEmail = z.object({
  id: recordId,
  purpose: z.string(),
  toAddress: z.string(),
  toName: z.string().nullable(),
  fromName: z.string(),
  replyTo: z.string().nullable(),
  subject: z.string(),
  textBody: z.string(),
  htmlBody: z.string(),
  status: emailStatus,
  failureSource: emailFailureSource.nullable(),
  failureCode: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  failedAt: z.iso.datetime().nullable(),
  resends: z.array(emailResend),
});
export type StoredEmail = z.infer<typeof storedEmail>;

/** A resend's new email and how its send went. */
export const resendEmailOutput = z.object({ id: recordId.nullable(), status: z.enum(["sent", "failed"]) });
export type ResendEmailOutput = z.infer<typeof resendEmailOutput>;
