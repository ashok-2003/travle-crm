// What the console reads from the email log (the failed-emails spec), in a platform transaction: the failed emails of
// the last 30 days, one email as it was sent with its resends, and the stored email a resend copies. Super admins
// only, which the console's router checks: the rows hold working reset and invite links.
import {
  SHORT_FAILURE_REASON_LENGTH,
  emailFailureSource,
  emailStatus,
  type FailedEmail,
  type FailedEmailsPage,
  type StoredEmail,
} from "@travel-crm/contracts/platform";
import type { OrgTx } from "@travel-crm/db";
import { emailLogs } from "@travel-crm/db/email-log";
import type { EmailMessage } from "@travel-crm/integrations/email";
import { DomainError } from "../kernel/index.js";
import { FAILED_KEEP_DAYS } from "./retention.js";

interface FailedRow {
  id: string;
  created_at: Date;
  to_address: string;
  to_name: string | null;
  subject: string;
  purpose: string;
  failure_source: string;
  failure_code: string;
  failure_reason: string | null;
  failed_at: Date;
  resent: boolean;
}

/**
 * A page of the failed emails of the last FAILED_KEEP_DAYS, newest first, after `cursor`. Each source's last automatic
 * attempt only: an earlier failure of the same source_ref is hidden by any later attempt (the retry that got through,
 * or failed again), so a notification retried five times shows once. A resend is never listed: the email it copies
 * says whether one got through, and its page lists them all.
 */
export async function failedEmails(
  tx: OrgTx,
  input: { cursor?: string | undefined; limit: number },
  now: Date,
): Promise<FailedEmailsPage> {
  // Refused here, as every other read of the table is, in an organization's transaction.
  emailLogs(tx);
  const since = new Date(now.getTime() - FAILED_KEEP_DAYS * 86_400_000);
  const cursor = input.cursor ?? null;
  const rows = await tx.$queryRaw<FailedRow[]>`
    SELECT e.id, e.created_at, e.to_address, e.to_name, e.subject, e.purpose, e.failure_source, e.failure_code,
           left(e.failure_reason, ${SHORT_FAILURE_REASON_LENGTH}::int) AS failure_reason, e.failed_at,
           EXISTS (SELECT 1 FROM email_log r WHERE r.resent_from_id = e.id AND r.status = 'sent') AS resent
    FROM email_log e
    WHERE e.status = 'failed' AND e.resent_from_id IS NULL AND e.created_at >= ${since}
      AND (${cursor}::uuid IS NULL OR e.id < ${cursor}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM email_log later
        WHERE later.source_ref = e.source_ref AND later.resent_from_id IS NULL AND later.created_at > e.created_at)
    ORDER BY e.id DESC
    LIMIT ${input.limit + 1}`;
  const page = rows.slice(0, input.limit);
  return {
    emails: page.map((row): FailedEmail => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      toAddress: row.to_address,
      toName: row.to_name,
      subject: row.subject,
      purpose: row.purpose,
      failureSource: emailFailureSource.parse(row.failure_source),
      failureCode: row.failure_code,
      failureReason: row.failure_reason,
      failedAt: row.failed_at.toISOString(),
      resent: row.resent,
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

const notFound = () => new DomainError("NOT_FOUND", "EMAIL_NOT_FOUND", "There is no such email (any more)");

/** One email exactly as it was sent, with how it went and its resends, oldest first. */
export async function storedEmailOf(tx: OrgTx, id: string): Promise<StoredEmail> {
  const row = await emailLogs(tx).findUnique({
    where: { id },
    include: { resends: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (row === null) throw notFound();
  const iso = (date: Date | null) => date?.toISOString() ?? null;
  return {
    id: row.id,
    purpose: row.purpose,
    toAddress: row.toAddress,
    toName: row.toName,
    fromName: row.fromName,
    replyTo: row.replyTo,
    subject: row.subject,
    textBody: row.textBody,
    htmlBody: row.htmlBody,
    status: emailStatus.parse(row.status),
    failureSource: row.failureSource === null ? null : emailFailureSource.parse(row.failureSource),
    failureCode: row.failureCode,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    sentAt: iso(row.sentAt),
    failedAt: iso(row.failedAt),
    resends: row.resends.map((resend) => ({
      id: resend.id,
      status: emailStatus.parse(resend.status),
      createdAt: resend.createdAt.toISOString(),
      sentAt: iso(resend.sentAt),
      failedAt: iso(resend.failedAt),
      failureCode: resend.failureCode,
    })),
  };
}

/** The stored headers, as the recording wrapper kept them: a JSON object of strings. */
function headersOf(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/** The failed email a resend sends again, as it was sent. Only a failed email is sent again. */
export async function emailToResend(tx: OrgTx, id: string): Promise<EmailMessage & { id: string }> {
  const row = await emailLogs(tx).findUnique({ where: { id } });
  if (row === null) throw notFound();
  if (row.status !== "failed") {
    throw new DomainError("CONFLICT", "EMAIL_NOT_FAILED", "Only an email that failed is sent again");
  }
  return {
    id: row.id,
    to: { name: row.toName ?? undefined, address: row.toAddress },
    fromName: row.fromName,
    replyTo: row.replyTo ?? undefined,
    subject: row.subject,
    text: row.textBody,
    html: row.htmlBody,
    headers: headersOf(row.headers),
    purpose: row.purpose,
    sourceRef: row.sourceRef ?? undefined,
  };
}
