// Brevo's reports (the failed-emails spec): an email Brevo accepted over SMTP and dropped afterwards (bounced, blocked,
// the account under review) is marked failed by the reference we sent on it, from the worker's processing of Brevo's
// webhook. A reference we don't hold (purged, or not ours) changes nothing, and so does a second report: the row ends
// the same however often it is processed.
import type { Database } from "@travel-crm/db";
import { emailLogs } from "@travel-crm/db/email-log";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FAILURE_CODE = 100;
const MAX_FAILURE_REASON = 1000;

/** One email the provider reports it dropped. */
export interface ProviderFailure {
  /** Our row's id, as the provider handed back the X-Mailin-custom header; anything else is ignored. */
  reference: string;
  /** The provider's event, e.g. "hard_bounce", "blocked". */
  code: string;
  /** The provider's reason, if it gave one. */
  reason: string | null;
  /** When the provider says it happened. */
  at: Date;
}

/** Marks each reported email failed, in one transaction; returns how many rows it found. */
export async function recordProviderFailures(db: Database, failures: readonly ProviderFailure[]): Promise<number> {
  const ours = failures.filter((failure) => UUID.test(failure.reference) && failure.code !== "");
  if (ours.length === 0) return 0;
  return db.withoutOrg(async (tx) => {
    let found = 0;
    for (const failure of ours) {
      const { count } = await emailLogs(tx).updateMany({
        where: { id: failure.reference },
        data: {
          status: "failed",
          failureSource: "provider",
          failureCode: failure.code.slice(0, MAX_FAILURE_CODE),
          failureReason: failure.reason === null ? null : failure.reason.slice(0, MAX_FAILURE_REASON),
          failedAt: failure.at,
        },
      });
      found += count;
    }
    return found;
  });
}
