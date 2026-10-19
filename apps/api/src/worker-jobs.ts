// Everything the worker runs (spec 9.1): each module's listeners (release 2's imports and exports among them), the
// webhook processing job, and the scheduled jobs, built from the process's services. The api and the worker are one
// image; `worker.ts` starts this side. The platform's own jobs, which need the platform role (the subscription
// lifecycle among them), run in the console process instead (console-jobs.ts).
import type { Database } from "@travel-crm/db";
import {
  addLeadImportListener,
  checkLeadImportListener,
  checkLeadSheetListener,
  handOverDepartingMemberListener,
  makeLeadExportListener,
  sheetsCheckHandler,
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
import {
  attentionListener,
  baselineListener,
  checkIntervalSeconds as defaultCheckIntervalSeconds,
  createAccountHolds,
  matchSheetImportListener,
  scheduleListener,
  sheetOriginOf,
  sheetsDispatchSchedule,
  type SheetsHashes,
} from "@travel-crm/domain/sheets";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { PushSender } from "@travel-crm/integrations/push";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";

export interface WorkerSheets {
  google: GoogleSheets;
  /** Keys the claims and erasure tombstones; SHEETS_HASH_KEY is required whenever Google is set (environment.ts). */
  hashes: SheetsHashes;
  /** Where the dispatcher queues the checks: the same pg-boss. */
  queue: JobQueue;
  /** How often a sheet is checked, in seconds: 120 unless the journeys shorten it (SHEETS_CHECK_INTERVAL_SECONDS). */
  checkIntervalSeconds?: number;
}

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
  /** The Google Sheets sync (ADR 0031): left out when no service account is set, and then none of its work runs. */
  sheets?: WorkerSheets;
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
  const importJobs: ImportJobDependencies = {
    files,
    spreadsheets,
    identity,
    subscriptions,
    seatLimit,
    // A Google Sheet's rows read as a file's do, with the sheet as their origin (the Sheets sync).
    sheetOrigin: sheetOriginOf,
  };
  const { sheets } = dependencies;
  // The Google Sheets sync's side: the checks, their dispatcher and the listeners around them, only when Google is set up.
  const sheetsJobs =
    sheets === undefined
      ? null
      : {
          db,
          files,
          spreadsheets,
          identity,
          subscriptions,
          log,
          google: sheets.google,
          hashes: sheets.hashes,
          holds: createAccountHolds(),
          checkIntervalSeconds: sheets.checkIntervalSeconds ?? defaultCheckIntervalSeconds,
        };
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
      ...(sheetsJobs === null
        ? []
        : [
            baselineListener(sheetsJobs),
            matchSheetImportListener(sheetsJobs),
            scheduleListener(sheetsJobs),
            attentionListener(sheetsJobs),
            checkLeadSheetListener(sheetsJobs),
          ]),
    ],
    handlers: [
      {
        queue: WEBHOOK_PROCESS_QUEUE,
        handle: async (data) => {
          await processWebhookJob({ db, providers: webhookProviders }, data);
        },
      },
      ...(sheetsJobs === null ? [] : [sheetsCheckHandler(sheetsJobs)]),
    ],
    schedules: [
      ...(sheets === undefined || sheetsJobs === null
        ? []
        : [
            sheetsDispatchSchedule({
              db,
              queue: sheets.queue,
              accounts: sheets.google.accounts().length,
              holds: sheetsJobs.holds,
            }),
          ]),
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
