// The console's failed emails (the owner, 2026-11-02; the failed-emails spec): the emails that failed in the last 30
// days, our own sends' failures and the ones Brevo reported dropping, each shown as it was sent, links included, and
// sent again by a super admin once the cause is fixed. And the email log's daily purge, which only the platform role
// may run. The router keeps every one of these to super admins.
import type {
  EmailIdInput,
  FailedEmailsPage,
  ListFailedEmailsInput,
  ResendEmailOutput,
  StoredEmail,
} from "@travel-crm/contracts/platform";
import { errorFields } from "@travel-crm/integrations/logging";
import { emailToResend, failedEmails, purgeEmailLog, storedEmailOf } from "../email-log/index.js";
import type { ScheduledJob } from "../jobs/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const PURGE_EMAIL_LOG_QUEUE = "email-log.purge";

/** A page of the failed emails, newest first. */
export async function listFailedEmails(
  services: PlatformServices,
  input: ListFailedEmailsInput,
  now: Date = new Date(),
): Promise<FailedEmailsPage> {
  return services.platformDb.transaction((tx) => failedEmails(tx, input, now));
}

/** One email exactly as it was sent, with its resends. */
export async function getStoredEmail(services: PlatformServices, id: string): Promise<StoredEmail> {
  return services.platformDb.transaction((tx) => storedEmailOf(tx, id));
}

/**
 * Sends a failed email again as it was, through the console's recorded sender: a new email that names it, with its
 * purpose and source. Logged first in the platform log, so nothing is sent that the log doesn't show, and logged again
 * when the resend fails too, with the adapter's code. Answers the new email's status.
 */
export async function resendFailedEmail(
  services: PlatformServices,
  staff: { userId: string },
  input: EmailIdInput,
): Promise<ResendEmailOutput> {
  const sender = services.email;
  // The console process always has one; only tests build the services without.
  if (sender == null) throw new Error("The console's services have no email sender");
  const stored = await services.platformDb.transaction((tx) => emailToResend(tx, input.id));
  const entry = { targetType: "email", targetId: stored.id, after: { purpose: stored.purpose ?? "other" } };
  await services.platformDb.transaction((tx) => recordPlatformAudit(tx, staff, { action: "email.resent", ...entry }));
  const outcome = await sender.resend(stored);
  if (outcome.status === "failed") {
    await services.platformDb
      .transaction((tx) =>
        recordPlatformAudit(tx, staff, {
          action: "email.resend-failed",
          ...entry,
          after: { ...entry.after, failure: outcome.failureCode },
        }),
      )
      .catch((logError: unknown) => {
        services.logger.error(
          { action: "email.resend-failed", targetId: stored.id, ...errorFields(logError) },
          "A failed platform action could not be logged",
        );
      });
  }
  return { id: outcome.id, status: outcome.status };
}

/** Daily at 04:05 India time, away from the other sweeps: sent emails after 7 days, failed ones after 30. */
export function emailLogPurgeSchedule(services: PlatformServices): ScheduledJob {
  return {
    queue: PURGE_EMAIL_LOG_QUEUE,
    cron: "5 4 * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      await services.platformDb.transaction((tx) => purgeEmailLog(tx, new Date()));
    },
  };
}
