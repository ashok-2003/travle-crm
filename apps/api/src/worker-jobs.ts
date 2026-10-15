// Everything the worker runs (spec 9.1): each module's listeners, the webhook processing job, and the scheduled jobs,
// built from the process's services. The api and the worker are one image; `worker.ts` starts this side.
import type { Database } from "@travel-crm/db";
import { renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { EventListener, JobHandler, ScheduledJob } from "@travel-crm/domain/jobs";
import { deliverNotificationListener, forgetPushSubscriptionsListener } from "@travel-crm/domain/notifications";
import { purgeExpiredRateLimits } from "@travel-crm/domain/rate-limits";
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { PushSender } from "@travel-crm/integrations/push";

export interface WorkerJobDependencies {
  db: Database;
  identity: Pick<Identity, "organizationProfile" | "memberContacts">;
  files: Files;
  email: EmailSender;
  push: PushSender;
  /** The web app's address, for links in notification emails. */
  appUrl: string;
  webhookProviders: readonly WebhookProvider[];
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
  const { db, identity, files, email, push, appUrl, webhookProviders, log } = dependencies;
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
      notifySharerListener(),
      forgetPushSubscriptionsListener,
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
        // Rate-limit windows last a minute; a day's worth is kept for looking into abuse.
        queue: "rate-limits.purge",
        cron: "30 3 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await purgeExpiredRateLimits(db, new Date(Date.now() - DAY_MS));
        },
      },
    ],
  };
}
