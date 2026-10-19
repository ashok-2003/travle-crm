// Everything the worker runs (spec 9.1): each module's listeners (release 2's imports and exports among them), the
// webhook processing job, and the scheduled jobs, built from the process's services. The api and the worker are one
// image; `worker.ts` starts this side. The platform's own jobs, which need the platform role (the subscription
// lifecycle among them), run in the console process instead (console-jobs.ts).
import type { Database } from "@travel-crm/db";
import {
  addLeadImportListener,
  checkLeadImportListener,
  handOverDepartingMemberListener,
  makeLeadExportListener,
} from "@travel-crm/domain/crm";
import { renderIssuedDocumentListener } from "@travel-crm/domain/documents";
import { makeStaffExportListener, type ExportJobDependencies } from "@travel-crm/domain/exports";
import type { Files } from "@travel-crm/domain/files";
import type { Identity, SeatLimit } from "@travel-crm/domain/identity";
import {
  addStaffImportListener,
  checkStaffImportListener,
  readImportFileListener,
  type ImportJobDependencies,
} from "@travel-crm/domain/imports";
import type { EventListener, JobHandler, ScheduledJob } from "@travel-crm/domain/jobs";
import { deliverNotificationListener, forgetPushSubscriptionsListener } from "@travel-crm/domain/notifications";
import { purgeExpiredRateLimits, RATE_LIMIT_PURGE_QUEUE, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { notifySharerListener } from "@travel-crm/domain/share-links";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { PushSender } from "@travel-crm/integrations/push";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";

export interface WorkerJobDependencies {
  db: Database;
  identity: Pick<
    Identity,
    | "organizationProfile"
    | "memberContacts"
    | "inviteListener"
    | "firstOwner"
    | "resolveAccess"
    | "leadWorkers"
    | "matchLeadWorkers"
    | "matchRoles"
    | "staff"
  >;
  files: Files;
  /** Reads an import's file and writes an export's (ADR 0030). */
  spreadsheets: Spreadsheets;
  /** Whether an organization may still change things, for an import's add acting for its importer (B31). */
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  /** The plan's seats, for the staff import's add (B45). */
  seatLimit: SeatLimit;
  email: EmailSender;
  push: PushSender;
  /** The web app's address, for links in notification emails. */
  appUrl: string;
  webhookProviders: readonly WebhookProvider[];
  /** Counts each address's invite emails against identity's own per-recipient cap, apart from password resets. */
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
  const { db, identity, files, spreadsheets, subscriptions, seatLimit, email, push, appUrl } = dependencies;
  const { webhookProviders, rateLimiter, log } = dependencies;
  // The bulk imports' and exports' listeners (release 2): two of each step share its event, each acting on its kind.
  const importJobs: ImportJobDependencies = { files, spreadsheets, identity, subscriptions, seatLimit };
  const exportJobs: ExportJobDependencies = { files, spreadsheets, identity, appUrl };
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
      handOverDepartingMemberListener({ firstOwner: (organizationId) => identity.firstOwner(organizationId) }),
      readImportFileListener(importJobs),
      checkLeadImportListener(importJobs),
      addLeadImportListener(importJobs),
      checkStaffImportListener(importJobs),
      addStaffImportListener(importJobs),
      makeLeadExportListener(exportJobs),
      makeStaffExportListener(exportJobs),
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
