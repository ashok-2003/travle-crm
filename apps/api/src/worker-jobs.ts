// Everything the worker runs (spec 9.1): each module's listeners, the webhook processing job, and the scheduled jobs,
// built from the process's services. The api and the worker are one image; `worker.ts` starts this side. The
// platform's own jobs, which need the platform role (the subscription lifecycle among them), run in the console
// process instead (console-jobs.ts).
import type { Database } from "@travel-crm/db";
import { renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { EventListener, JobHandler, ScheduledJob } from "@travel-crm/domain/jobs";
import { deliverNotificationListener, forgetPushSubscriptionsListener } from "@travel-crm/domain/notifications";
import { purgeExpiredRateLimits, RATE_LIMIT_PURGE_QUEUE, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { PushSender } from "@travel-crm/integrations/push";

export interface WorkerJobDependencies {
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "memberContacts" | "inviteListener">;
  files: Files;
  email: EmailSender;
  push: PushSender;
  /** The web app's address, for links in notification emails. */
  appUrl: string;
  webhookProviders: readonly WebhookProvider[];
  /** Counts each address's password emails: the invites share plan 3's per-recipient cap. */
  rateLimiter: RateLimiter;
  /** Where problems that need attention go, one line each, ids and codes only: the worker's log. */
  log: (line: string) => void;
}

export interface WorkerJobs {
  listeners: EventListener[];
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function workerJobs(dependencies: WorkerJobDependencies): WorkerJobs {
  const { db, identity, files, email, push, appUrl, webhookProviders, rateLimiter, log } = dependencies;
  return {
    listeners: [
      renderIssuedDocumentListener({ files, render: renderPdf }),
      deliverNotificationListener({
        email,
        push,
        organizationProfile: (organizationId) => identity.organizationProfile(organizationId),
        memberContacts: (organizationId, userIds) => identity.memberContacts(organizationId, userIds),
        appUrl,
        log,
      }),
      notifySharerListener({
        memberContacts: (organizationId, userIds) => identity.memberContacts(organizationId, userIds),
      }),
      forgetPushSubscriptionsListener,
      identity.inviteListener({ email, appUrl, limiter: rateLimiter }),
    ],
    handlers: [
      {
        queue: WEBHOOK_PROCESS_QUEUE,
        handle: async (data) => {
          await processWebhookJob({ db, providers: webhookProviders }, data);
        },
      },
    ],
    schedules: [
      {
        // Rate-limit windows last a minute; a day's worth is kept for looking into abuse. The job is the platform's,
        // not an organization's, so it runs in a fixed zone: India time, a quiet hour for the agencies it serves.
        queue: RATE_LIMIT_PURGE_QUEUE,
        cron: "30 3 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await purgeExpiredRateLimits(db, new Date(Date.now() - DAY_MS));
        },
      },
    ],
  };
}
