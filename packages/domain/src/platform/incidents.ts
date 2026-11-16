// The system's health on the console (the owner, 2026-11-02): reports from every process (the AI down or out of its
// limit, the api's errors) and the console's own checks every five minutes (jobs that used all their retries, a worker
// that stopped answering its ping) open an incident, one per kind at a time. Every super admin's browser gets a web push
// when one opens and when it is resolved, after half an hour without a report (the owner, 2026-11-17). The email is for
// what lasts: a kind other than the AI's is emailed when it opens; an AI incident (a flaky provider opens many) only if
// it is still open after half an hour, found by the health check, and "Back to normal" is emailed only for an incident
// that was emailed. The dashboard shows what is open and the last week's.
import {
  incidentKind,
  incidentReport,
  type IncidentKind,
  type PlatformIncident,
  type PlatformIncidents,
} from "@travel-crm/contracts/platform";
import { isUniqueViolation } from "@travel-crm/db";
import type { PlatformTx } from "@travel-crm/db/platform";
import { renderEmail, senderNameFor } from "@travel-crm/integrations/email";
import { errorFields } from "@travel-crm/integrations/logging";
import { platformStaffAccounts } from "../identity/index.js";
import {
  PLATFORM_INCIDENT_QUEUE,
  WORKER_PING_QUEUE,
  WORKER_PONG_QUEUE,
  type JobHandler,
  type ScheduledJob,
} from "../jobs/index.js";
import { formatDateTime } from "../kernel/index.js";
import { pushToSuperAdmins } from "./push.js";
import type { PlatformServices } from "./services.js";

export const HEALTH_CHECK_QUEUE = "platform.health-check";
/** An incident with no report for this long is over. */
const QUIET_BEFORE_RESOLVED_MS = 30 * 60_000;
/** A worker that hasn't answered a ping for this long has stopped. */
const WORKER_SILENT_MS = 15 * 60_000;
/** An AI incident this old, never emailed, is emailed once. */
const AI_EMAIL_AFTER_MS = 30 * 60_000;
const RECENT_MS = 7 * 24 * 60 * 60_000;
/** The console's emails give times in India, as its jobs run. */
const EMAIL_TIME_ZONE = "Asia/Kolkata";

const AI_KINDS: readonly IncidentKind[] = ["ai.unavailable", "ai.rate-limited"];

const titles: Record<IncidentKind, string> = {
  "ai.unavailable": "The AI isn't answering",
  "ai.rate-limited": "The AI's limit is used up",
  "jobs.failed": "Background jobs are failing",
  "api.errors": "The api is hitting errors",
  "worker.stalled": "The worker isn't taking jobs",
};

const explanations: Record<IncidentKind, string> = {
  "ai.unavailable":
    "No AI model answered: the provider may be down or its key wrong. Meanwhile the AI answers no customer and drafts nothing.",
  "ai.rate-limited":
    "Every AI model and key said its limit is used up. The AI answers again when the limit resets; billing or a backup key (AI_BACKUP_API_KEY) ends the wait.",
  "jobs.failed": "Jobs used all their retries and stopped. The console's Jobs page lists them and runs them again.",
  "api.errors": "Requests ended in errors nothing handled. The server's log has their names and codes.",
  "worker.stalled":
    "The worker didn't answer the console's ping. Follow-ups, WhatsApp replies, the AI, imports and emails wait until it runs again.",
};

function incidentOf(row: {
  id: string;
  kind: string;
  detail: string;
  openedAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  reports: number;
}): PlatformIncident {
  return {
    id: row.id,
    kind: incidentKind.parse(row.kind),
    detail: row.detail,
    openedAt: row.openedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reports: row.reports,
  };
}

/** One more report of the open incident of its kind, or a new one (its id). */
async function record(tx: PlatformTx, kind: IncidentKind, detail: string, now: Date): Promise<string | null> {
  const seen = { lastSeenAt: now, detail, reports: { increment: 1 } };
  const open = await tx.platformIncident.findFirst({ where: { kind, resolvedAt: null }, select: { id: true } });
  if (open !== null) {
    await tx.platformIncident.update({ where: { id: open.id }, data: seen });
    return null;
  }
  return (await tx.platformIncident.create({ data: { kind, detail, openedAt: now, lastSeenAt: now } })).id;
}

/** Each super admin with a real address, emailed one thing; a failed send is logged and the rest still go. */
async function emailSuperAdmins(services: PlatformServices, subject: string, paragraphs: string[]): Promise<void> {
  const email = services.email;
  if (email == null) return;
  const staff = await services.platformDb.transaction((tx) => platformStaffAccounts(tx));
  const consoleUrl = services.appUrl === undefined ? undefined : `${services.appUrl.replace(/\/+$/, "")}/console`;
  const content = renderEmail({
    heading: subject,
    paragraphs,
    action: consoleUrl === undefined ? undefined : { label: "Open the console", url: consoleUrl },
    footer: "You get this because you are a super admin of the platform.",
  });
  for (const admin of staff) {
    if (admin.level !== "super-admin" || admin.email.endsWith(".invalid")) continue;
    try {
      await email.send({
        to: { name: admin.name, address: admin.email },
        fromName: senderNameFor("Platform health"),
        subject,
        ...content,
        purpose: "platform-incident",
      });
    } catch (error) {
      services.logger.error(
        { queue: PLATFORM_INCIDENT_QUEUE, ...errorFields(error) },
        "A super admin couldn't be emailed about an incident",
      );
    }
  }
}

/** Records a report, and pushes to the super admins when it opens an incident (and emails, but for the AI's). */
export async function reportPlatformIncident(
  services: PlatformServices,
  kind: IncidentKind,
  detail: string,
  now: Date,
): Promise<void> {
  const write = () => services.platformDb.transaction((tx) => record(tx, kind, detail.slice(0, 200), now));
  let openedId: string | null;
  try {
    openedId = await write();
  } catch (error) {
    // Another report opened it a moment ago: this one is a report of it.
    if (!isUniqueViolation(error)) throw error;
    openedId = await write();
  }
  if (openedId === null) return;
  services.logger.warn({ queue: PLATFORM_INCIDENT_QUEUE, kind }, "An incident opened");
  const subject = `Platform alert: ${titles[kind]}`;
  await pushToSuperAdmins(services, { title: subject, body: explanations[kind] }, PLATFORM_INCIDENT_QUEUE);
  if (AI_KINDS.includes(kind)) return;
  await markEmailed(services, openedId, now);
  await emailSuperAdmins(services, subject, [
    explanations[kind],
    ...(detail === "" ? [] : [`Where: ${detail.slice(0, 200)}`]),
    `Since ${formatDateTime(now, { timeZone: EMAIL_TIME_ZONE, style: "date-time" })} (India time).`,
  ]);
}

/** Notes that the super admins were emailed about it. Only a null emailed_at is filled, so it is claimed once. */
async function markEmailed(services: PlatformServices, id: string, now: Date): Promise<boolean> {
  const { count } = await services.platformDb.transaction((tx) =>
    tx.platformIncident.updateMany({ where: { id, emailedAt: null }, data: { emailedAt: now } }),
  );
  return count > 0;
}

/**
 * An AI incident open for half an hour that nobody was emailed about: emailed now, once. The claim comes first, so two
 * checks never send it twice; a console that crashes between the claim and the email loses that one email.
 */
export async function emailLongAiIncidents(services: PlatformServices, now: Date): Promise<void> {
  const due = await services.platformDb.transaction((tx) =>
    tx.platformIncident.findMany({
      where: {
        kind: { in: [...AI_KINDS] },
        resolvedAt: null,
        emailedAt: null,
        openedAt: { lte: new Date(now.getTime() - AI_EMAIL_AFTER_MS) },
      },
      select: { id: true, kind: true, openedAt: true },
    }),
  );
  for (const incident of due) {
    if (!(await markEmailed(services, incident.id, now))) continue;
    const kind = incidentKind.parse(incident.kind);
    await emailSuperAdmins(services, `Still happening: ${titles[kind]}`, [
      explanations[kind],
      `It has lasted 30 minutes: since ${formatDateTime(incident.openedAt, { timeZone: EMAIL_TIME_ZONE, style: "date-time" })} (India time).`,
    ]);
  }
}

/** Incidents quiet for half an hour are over: each is resolved, pushed, and emailed if its opening or wait was. */
export async function resolveQuiet(services: PlatformServices, now: Date): Promise<void> {
  const resolved = await services.platformDb.transaction((tx) =>
    tx.platformIncident.updateManyAndReturn({
      where: { resolvedAt: null, lastSeenAt: { lt: new Date(now.getTime() - QUIET_BEFORE_RESOLVED_MS) } },
      data: { resolvedAt: now },
      select: { kind: true, openedAt: true, emailedAt: true },
    }),
  );
  for (const incident of resolved) {
    const kind = incidentKind.parse(incident.kind);
    services.logger.info({ queue: HEALTH_CHECK_QUEUE, kind }, "An incident was resolved");
    const subject = `Back to normal: ${titles[kind]}`;
    const since = formatDateTime(incident.openedAt, { timeZone: EMAIL_TIME_ZONE, style: "date-time" });
    const sentence = `Nothing has been reported for half an hour, so it is marked resolved. It started ${since} (India time).`;
    await pushToSuperAdmins(services, { title: subject, body: sentence }, HEALTH_CHECK_QUEUE);
    if (incident.emailedAt !== null) await emailSuperAdmins(services, subject, [sentence]);
  }
}

/** The incident jobs every process sends, recorded here. */
export function incidentHandler(services: PlatformServices): JobHandler {
  return {
    queue: PLATFORM_INCIDENT_QUEUE,
    handle: async (data) => {
      const report = incidentReport.parse(data);
      await reportPlatformIncident(services, report.kind, report.detail, new Date());
    },
  };
}

/**
 * Every five minutes: a ping for the worker (its answer, on the pong queue, says it is alive), the jobs that failed since
 * the last check, a worker silent too long, the AI incidents that have lasted half an hour, and the incidents that went
 * quiet. What it remembers lives in this process:
 * a console that restarts gives the worker the full quarter of an hour again.
 */
export function healthCheck(services: PlatformServices): { schedule: ScheduledJob; pongHandler: JobHandler } {
  let lastPong = Date.now();
  let lastCheck = new Date();
  const schedule: ScheduledJob = {
    queue: HEALTH_CHECK_QUEUE,
    cron: "*/5 * * * *",
    timeZone: "Asia/Kolkata",
    handle: async () => {
      const now = new Date();
      await services.queue.send(WORKER_PING_QUEUE, { sentAt: now.toISOString() });
      if (now.getTime() - lastPong > WORKER_SILENT_MS) {
        await reportPlatformIncident(services, "worker.stalled", "", now);
      }
      const since = lastCheck;
      lastCheck = now;
      const failed = (await services.jobs.failedJobs({ limit: 50 })).filter(
        (job) => job.failedAt !== null && job.failedAt > since,
      );
      if (failed.length > 0) {
        const queues = [...new Set(failed.map((job) => job.queue))].join(", ");
        await reportPlatformIncident(services, "jobs.failed", queues, now);
      }
      // Resolve first: an incident that went quiet is over, not "still happening".
      await resolveQuiet(services, now);
      await emailLongAiIncidents(services, now);
    },
  };
  const pongHandler: JobHandler = {
    queue: WORKER_PONG_QUEUE,
    handle: () => {
      lastPong = Date.now();
      return Promise.resolve();
    },
  };
  return { schedule, pongHandler };
}

/** What is open now, newest first, and the last week's resolved incidents. */
export async function listPlatformIncidents(
  services: PlatformServices,
  now: Date = new Date(),
): Promise<PlatformIncidents> {
  return services.platformDb.transaction(async (tx) => {
    const open = await tx.platformIncident.findMany({ where: { resolvedAt: null }, orderBy: { openedAt: "desc" } });
    const recent = await tx.platformIncident.findMany({
      where: { resolvedAt: { gte: new Date(now.getTime() - RECENT_MS) } },
      orderBy: { openedAt: "desc" },
      take: 20,
    });
    return { open: open.map(incidentOf), recent: recent.map(incidentOf) };
  });
}
