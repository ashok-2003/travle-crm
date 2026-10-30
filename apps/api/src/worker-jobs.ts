// Everything the worker runs (spec 9.1): each module's listeners (release 2's imports and exports among them), the
// webhook processing job, and the scheduled jobs, built from the process's services. The api and the worker are one
// image; `worker.ts` starts this side. The platform's own jobs, which need the platform role (the subscription
// lifecycle among them), run in the console process instead (console-jobs.ts).
import type { Database } from "@travel-crm/db";
import {
  addLeadImportListener,
  catchUpBroughtInFormListener,
  checkFirstReply,
  checkMetaPageListener,
  earlierLeadsListener,
  matchMetaImportListener,
  metaCatchupHandler,
  checkLeadImportListener,
  FIRST_REPLY_CHECK_QUEUE,
  notifyUnassignedLeadListener,
  scheduleFirstReplyCheckListener,
  checkLeadSheetListener,
  handOverDepartingMemberListener,
  makeLeadExportListener,
  leadSheetBaselineFingerprints,
  sheetsCheckHandler,
} from "@travel-crm/domain/crm";
import {
  BOOKING_COMPLETE_QUEUE,
  BOOKING_DUE_WORK_QUEUE,
  completeFinishedBookings,
  quoteAcceptedListener,
  quoteRevertedListener,
  runBookingDueWork,
} from "@travel-crm/domain/bookings";
import { DEPARTURE_HOLDS_QUEUE, runDepartureHoldExpiry, seatsFreedListener } from "@travel-crm/domain/departures";
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
import {
  attentionListener as metaAttentionListener,
  checkAllPages,
  META_HEALTH_QUEUE,
  metaDispatchSchedule,
  metaImportSource,
  routeListener as metaRouteListener,
} from "@travel-crm/domain/meta-leads";
import {
  ADOPT_QUEUE,
  adoptAll,
  checkAllConnections,
  COPY_MEDIA_QUEUE,
  copyMediaJob,
  messageNoticeListener,
  pastCustomerNoticeListener,
  routeListener as whatsappRouteListener,
  sendMessageListener,
  syncAllTemplates,
  WHATSAPP_HEALTH_QUEUE,
  automationListener,
  tripKitKeywordListener,
  broadcastListener,
  INBOX_DUE_WORK_QUEUE,
  runDueWork,
  WHATSAPP_TEMPLATES_QUEUE,
} from "@travel-crm/domain/inbox";
import { MORNING_PUSH_QUEUE, runMorningPush } from "@travel-crm/domain/today";
import { deliverNotificationListener, forgetPushSubscriptionsListener } from "@travel-crm/domain/notifications";
import {
  customerWroteListener,
  greetNewLeadListener,
  quoteOpenedListener,
  runSalesDueWork,
  SALES_DUE_WORK_QUEUE,
  stopFollowUpsListener,
} from "@travel-crm/domain/sales";
import {
  AI_LEARN_QUEUE,
  AI_NUDGES_QUEUE,
  aiChatResumedListener,
  aiCustomerWroteListener,
  aiPaymentProofListener,
  aiDocumentListener,
  aiReplyHandler,
  runAiLearning,
  runAiNudges,
  scoreHandler,
  scoreOnCustomerWroteListener,
} from "@travel-crm/domain/ai";
import { purgeExpiredRateLimits, RATE_LIMIT_PURGE_QUEUE, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { notifySharerListener } from "@travel-crm/domain/share-links";
import { runSupplierDueSoon, SUPPLIER_DUES_QUEUE } from "@travel-crm/domain/suppliers";
import {
  attentionListener,
  baselineListener,
  checkIntervalSeconds as defaultCheckIntervalSeconds,
  createAccountHolds,
  earlierSheetFingerprints,
  findTombstones,
  matchSheetImportListener,
  scheduleListener,
  sheetOriginOf,
  sheetsDispatchSchedule,
  type SheetsHashes,
} from "@travel-crm/domain/sheets";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { processWebhookJob, WEBHOOK_PROCESS_QUEUE, type WebhookProvider } from "@travel-crm/domain/webhooks";
import { metaProcessDependencies, type MetaServices } from "./meta-services.js";
import { inboxDependenciesOf, type WhatsAppServices } from "./whatsapp-services.js";
import type { EmailSender } from "@travel-crm/integrations/email";
import { renderPdf } from "@travel-crm/integrations/pdf";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { documentText, type AiModel } from "@travel-crm/integrations/ai";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import type { PushSender } from "@travel-crm/integrations/push";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";

export interface WorkerSheets {
  google: GoogleSheets;
  /** Keys the claims and erasure tombstones; SHEETS_HASH_KEY is required whenever Google is set (environment.ts). */
  hashes: SheetsHashes;
  /** Where the dispatcher queues the checks: the same pg-boss. */
  queue: JobQueue;
  /** How often a sheet is checked, in seconds: 900 (with up to a third more at random) unless the journeys shorten it (SHEETS_CHECK_INTERVAL_SECONDS). */
  checkIntervalSeconds?: number;
}

/** The time zone an organization without a profile reads its working hours in. */
const DEFAULT_TIME_ZONE = "Asia/Kolkata";
/** How many webhooks the worker processes at once (each takes seconds against a distant database). */
export const WEBHOOK_CONCURRENCY = 3;

export interface WorkerJobDependencies {
  db: Database;
  identity: Pick<
    Identity,
    | "organizationProfile"
    | "organizationsPage"
    | "memberContacts"
    | "inviteListener"
    | "firstOwner"
    | "membersHolding"
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
  /** The Meta lead ads (ADR 0034): left out or null when the five Meta settings are not set, and then none of its work runs. */
  meta?: MetaServices | null;
  /** WhatsApp through MSG91 (ADR 0035): null or left out when the three settings are not set; the route and notices still run. */
  whatsapp?: WhatsAppServices | null;
  /** The worker's structured log (ADR 0032): ids, codes, counts and timings only. */
  logger: Logger;
  /** The AI (ADR 0029): null or left out when no OpenRouter key is set, and then nothing is ever sent to it. */
  ai?: AiModel | null;
  /** Where listeners queue delayed jobs (a new lead's first-reply check): the same pg-boss. Without it, no checks. */
  jobs?: JobQueue;
}

export interface WorkerJobs {
  listeners: EventListener[];
  handlers: JobHandler[];
  schedules: ScheduledJob[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function workerJobs(dependencies: WorkerJobDependencies): WorkerJobs {
  const { db, identity, files, spreadsheets, subscriptions, seatLimit, email, push, appUrl } = dependencies;
  // Who the slow-reply alert and the Unassigned notice go to: everyone whose role holds leads:assign (release 4).
  const leadAssigners = (organizationId: string) => identity.membersHolding(organizationId, "leads:assign");
  const { webhookProviders, rateLimiter, logger } = dependencies;
  const salesJobsTimeZone = async (organizationId: string) =>
    (await identity.organizationProfile(organizationId))?.timeZone ?? DEFAULT_TIME_ZONE;
  const salesJobsNames = async (organizationId: string, ownerUserId: string | null) => {
    const [organization, owners] = await Promise.all([
      identity.organizationProfile(organizationId),
      ownerUserId === null ? Promise.resolve([]) : identity.memberContacts(organizationId, [ownerUserId]),
    ]);
    return { agencyName: organization?.name ?? "our team", agentName: owners[0]?.name ?? null };
  };
  const ai = dependencies.ai ?? null;
  // The bulk imports' and exports' listeners (release 2): two of each step share its event, each acting on its kind.
  const importJobs: ImportJobDependencies = {
    files,
    spreadsheets,
    identity,
    subscriptions,
    seatLimit,
    logger,
    // A Google Sheet's rows read as a file's do, with the sheet as their origin (the Sheets sync).
    sheetOrigin: sheetOriginOf,
    // A Meta lead form's earlier leads carry the form as their source detail (the Meta lead ads).
    metaSource: metaImportSource,
  };
  const { sheets } = dependencies;
  // A file imported after a sheet meets the rows the sheet added (SD15).
  if (sheets !== undefined) {
    importJobs.sheetFingerprints = (tx, fingerprints) => earlierSheetFingerprints(tx, fingerprints, sheets.hashes);
    importJobs.sheetErasedContacts = (tx, contacts) => findTombstones(tx, sheets.hashes, contacts);
  }
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
          logger,
          google: sheets.google,
          hashes: sheets.hashes,
          holds: createAccountHolds(),
          checkIntervalSeconds: sheets.checkIntervalSeconds ?? defaultCheckIntervalSeconds,
          baselineFingerprints: leadSheetBaselineFingerprints(db, sheets.hashes),
        };
  // Who hears of a booking the AI took and of a customer's payment proof: whoever manages the agency's settings.
  const bookingManagers = (organizationId: string) => identity.membersHolding(organizationId, "settings:manage");
  // The autopilot: the AI's turns, its nudges and its nightly lessons, in the agency's own name, with its media.
  const autopilotJobs = (model: AiModel) => ({
    db,
    ai: model,
    subscriptions,
    agencyName: async (organizationId: string) =>
      (await identity.organizationProfile(organizationId))?.name ?? "the agency",
    files,
    managers: bookingManagers,
  });
  // Bookings: the reminders now due and the claims left waiting, each minute; the finished trips, each night.
  const bookingJobs = {
    db,
    appUrl,
    logger,
    identity,
    subscriptions,
    timeZone: salesJobsTimeZone,
    names: salesJobsNames,
  };
  // Departures: the holds whose time has come; suppliers: the payments falling due.
  const departureJobs = { db, identity, subscriptions, logger };
  const exportJobs: ExportJobDependencies = { files, spreadsheets, identity, appUrl, logger };
  // Sales execution: the agency's name and the lead owner's for the WhatsApp blanks, in the agency's own time.
  const salesJobs = { db, appUrl, logger, timeZone: salesJobsTimeZone, names: salesJobsNames };
  // The Meta lead ads' side: the route, the notices, the checks and the import of a form's earlier leads, only when Meta is set up.
  const { meta = null } = dependencies;
  const metaJobs = meta === null ? null : metaProcessDependencies(meta.dependencies, { identity, subscriptions });
  const metaListeners =
    meta === null || metaJobs === null
      ? []
      : [
          metaRouteListener(meta.dependencies),
          metaAttentionListener({ identity }),
          checkMetaPageListener(metaJobs),
          catchUpBroughtInFormListener(metaJobs),
          earlierLeadsListener({ ...metaJobs, files, spreadsheets, identity }),
          matchMetaImportListener({ ...metaJobs, files, spreadsheets, identity, subscriptions }),
        ];
  // The inbox: the number's route and the notices always run (a connection can be recorded before the settings are set); the
  // copier, the health check and the adoption job need the queue.
  const inbox =
    dependencies.jobs === undefined
      ? null
      : inboxDependenciesOf(dependencies.whatsapp ?? null, {
          db,
          files,
          queue: dependencies.jobs,
          logger,
          limiter: rateLimiter,
          identity,
          subscriptions,
        });
  return {
    listeners: [
      whatsappRouteListener({ db, logger }),
      messageNoticeListener({ managers: leadAssigners }),
      pastCustomerNoticeListener({ managers: leadAssigners }),
      // The automatic answers (away, welcome, keyword) to a customer who just wrote (sales inbox spec 6).
      automationListener({
        timeZone: async (organizationId) =>
          (await identity.organizationProfile(organizationId))?.timeZone ?? DEFAULT_TIME_ZONE,
      }),
      // Sales execution: a new lead's first WhatsApp and follow-ups, and what makes a lead hot (a quote opened, a buying
      // word), its owner told to call.
      greetNewLeadListener(salesJobs),
      quoteOpenedListener(),
      customerWroteListener(),
      stopFollowUpsListener(),
      // A trip's details, sent by themselves when a customer's message holds one of its keywords (once a chat).
      tripKitKeywordListener({ db, files }),
      // A broadcast's waiting recipients go out here, a batch at a time (sales inbox spec 6).
      broadcastListener({
        timeZone: async (organizationId) =>
          (await identity.organizationProfile(organizationId))?.timeZone ?? DEFAULT_TIME_ZONE,
      }),
      // Replies queued from the inbox go out here, one at a time, outside any transaction (spec 4.4).
      ...(inbox === null
        ? []
        : [
            sendMessageListener({
              provider: inbox.provider,
              files,
              limiter: rateLimiter,
              logger,
              managers: leadAssigners,
            }),
          ]),
      renderIssuedDocumentListener({ files, render: renderPdf }),
      // An accepted quote becomes a booking (release 6), and a reverted one takes its booking away.
      quoteAcceptedListener(),
      quoteRevertedListener(),
      // A departure's seats free up: the first lead waiting whose party fits has its owner told (release 7a).
      seatsFreedListener(),
      deliverNotificationListener({
        email,
        push,
        organizationProfile: (organizationId) => identity.organizationProfile(organizationId),
        memberContacts: (organizationId, userIds) => identity.memberContacts(organizationId, userIds),
        appUrl,
        logger,
      }),
      notifySharerListener({
        memberContacts: (organizationId, userIds) => identity.memberContacts(organizationId, userIds),
      }),
      forgetPushSubscriptionsListener,
      identity.inviteListener({ email, appUrl, limiter: rateLimiter }),
      handOverDepartingMemberListener({ firstOwner: (organizationId) => identity.firstOwner(organizationId) }),
      // The slow-reply alert (release C): each new lead's check, queued for when its wait runs out.
      ...(dependencies.jobs === undefined
        ? []
        : [
            scheduleFirstReplyCheckListener({
              queue: dependencies.jobs,
              timeZone: async (organizationId) =>
                (await identity.organizationProfile(organizationId))?.timeZone ?? DEFAULT_TIME_ZONE,
            }),
            notifyUnassignedLeadListener({ managers: leadAssigners }),
          ]),
      // What the agency tells its AI to know: an uploaded document's words are read (no AI call), and, for an agency with the
      // AI on, a lead is scored once for each burst of the customer's messages.
      aiDocumentListener({ files, readText: documentText }),
      // A photo or PDF from a customer whose AI booking waits for payment is kept as their proof; the team is told.
      aiPaymentProofListener({ recipients: bookingManagers }),
      ...(dependencies.jobs === undefined || ai === null
        ? []
        : [
            scoreOnCustomerWroteListener({ queue: dependencies.jobs, ai, subscriptions }),
            // The autopilot: an agency's AI answering its chats by itself, only where it was turned on.
            aiCustomerWroteListener({ queue: dependencies.jobs, subscriptions }),
            aiChatResumedListener({ queue: dependencies.jobs, subscriptions }),
          ]),
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
            scheduleListener({
              ...sheetsJobs,
              checkIntervalSeconds: sheets?.checkIntervalSeconds ?? defaultCheckIntervalSeconds,
            }),
            attentionListener(sheetsJobs),
            checkLeadSheetListener(sheetsJobs),
          ]),
      ...metaListeners,
    ],
    handlers: [
      ...(ai === null ? [] : [scoreHandler({ db, ai, subscriptions, logger })]),
      ...(ai === null ? [] : [aiReplyHandler({ ...autopilotJobs(ai), logger })]),
      {
        queue: WEBHOOK_PROCESS_QUEUE,
        // A few at once: each takes seconds against a distant database, and a customer's burst of messages would wait in
        // a line. One body is at most 64 KB, and each message is saved under its chat's lock (a burst still makes one lead).
        concurrency: WEBHOOK_CONCURRENCY,
        handle: async (data) => {
          await processWebhookJob({ db, providers: webhookProviders }, data);
        },
      },
      {
        queue: FIRST_REPLY_CHECK_QUEUE,
        handle: async (data) => {
          await checkFirstReply({ db, managers: leadAssigners }, data);
        },
      },
      ...(inbox === null
        ? []
        : [
            {
              queue: COPY_MEDIA_QUEUE,
              handle: async (data: Parameters<typeof copyMediaJob>[1]) => {
                await copyMediaJob(inbox, data);
              },
            },
          ]),
      ...(sheetsJobs === null ? [] : [sheetsCheckHandler(sheetsJobs)]),
      ...(metaJobs === null ? [] : [metaCatchupHandler(metaJobs)]),
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
      ...(meta === null || dependencies.jobs === undefined
        ? []
        : [
            metaDispatchSchedule({ db, queue: dependencies.jobs }),
            {
              // Each Page's token, subscription and form questions are looked at once a day, in a quiet hour.
              queue: META_HEALTH_QUEUE,
              cron: "10 4 * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await checkAllPages(meta.dependencies, new Date());
              },
            },
          ]),
      ...(inbox === null
        ? []
        : [
            {
              // Messages sent later whose time has come, and snoozed chats waking (sales inbox spec 6).
              queue: INBOX_DUE_WORK_QUEUE,
              cron: "* * * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await runDueWork({ db, logger }, new Date());
              },
            },
            ...(ai === null
              ? []
              : [
                  {
                    // Follow-ups on leads that came due, then the autopilot's nudges to quiet customers, inside the window.
                    queue: AI_NUDGES_QUEUE,
                    cron: "* * * * *",
                    timeZone: "Asia/Kolkata",
                    handle: async () => {
                      await runAiNudges({ ...autopilotJobs(ai), logger }, new Date());
                    },
                  },
                  {
                    // Each night, an agency that lets its AI learn gets a lesson run from its recent chats.
                    queue: AI_LEARN_QUEUE,
                    cron: "30 2 * * *",
                    timeZone: "Asia/Kolkata",
                    handle: async () => {
                      await runAiLearning({ ...autopilotJobs(ai), logger }, new Date());
                    },
                  },
                ]),
            {
              // Sales execution: follow-ups whose day has come, and payment reminders, between 10:00 and 20:00.
              queue: SALES_DUE_WORK_QUEUE,
              cron: "* * * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await runSalesDueWork(salesJobs, new Date());
              },
            },
            {
              // Delivery reports that stopped, rows stuck sending, and media never queued (spec 8.4).
              queue: WHATSAPP_HEALTH_QUEUE,
              cron: "*/5 * * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await checkAllConnections(inbox, new Date());
              },
            },
            {
              // The templates' statuses, so a rejection is noticed and the Owner told (spec 4.8).
              queue: WHATSAPP_TEMPLATES_QUEUE,
              cron: "*/30 * * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await syncAllTemplates(inbox, new Date());
              },
            },
            {
              // Chats stored while the subscription did not allow changes get their lead once it does (spec 8.5).
              queue: ADOPT_QUEUE,
              cron: "17 * * * *",
              timeZone: "Asia/Kolkata",
              handle: async () => {
                await adoptAll(inbox, new Date());
              },
            },
          ]),
      {
        // Bookings: a traveller's reminders now due (or a task to send them by hand) and the claims waiting over a day.
        queue: BOOKING_DUE_WORK_QUEUE,
        cron: "* * * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await runBookingDueWork(bookingJobs, new Date());
        },
      },
      {
        // Departures: a hold whose time has come expires, tells the lead's owner and frees its seats.
        queue: DEPARTURE_HOLDS_QUEUE,
        cron: "*/10 * * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await runDepartureHoldExpiry(departureJobs, new Date());
        },
      },
      {
        // Suppliers: the accounts' keepers are told, once for each cost, of a payment due within two days.
        queue: SUPPLIER_DUES_QUEUE,
        cron: "0 9 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await runSupplierDueSoon(departureJobs, new Date());
        },
      },
      {
        // A trip whose last day was yesterday becomes Completed.
        queue: BOOKING_COMPLETE_QUEUE,
        cron: "20 2 * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await completeFinishedBookings(bookingJobs, new Date());
        },
      },
      {
        // Each person's morning summary push, at the time they chose in their agency's zone (release 5): looked for every
        // 15 minutes, one push a person a day.
        queue: MORNING_PUSH_QUEUE,
        cron: "*/15 * * * *",
        timeZone: "Asia/Kolkata",
        handle: async () => {
          await runMorningPush({ db, identity, subscriptions, logger }, new Date());
        },
      },
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
