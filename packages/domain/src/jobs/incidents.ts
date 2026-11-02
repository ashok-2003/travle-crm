// Telling the console something broke (the owner, 2026-11-02): any process (the api, the worker) reports it as a job the
// console handles, keeps as an incident, emails to the super admins and shows on its dashboard. The api and the worker
// can't reach the platform's tables, so the queue is the way. A report holds a kind and a short code, never personal data;
// one process sends the same report at most once in a few minutes, and the job id keeps the processes from all
// sending it in one window. The worker also answers the console's ping, so a worker that stopped shows up.
import type { IncidentKind } from "@travel-crm/contracts/platform";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import { listenerJobId } from "./listener-job-id.js";
import type { JobHandler } from "./worker.js";

export const PLATFORM_INCIDENT_QUEUE = "platform.incident";
/** The console asks the worker every few minutes; the worker answers on the console's queue. */
export const WORKER_PING_QUEUE = "health.worker-ping";
export const WORKER_PONG_QUEUE = "platform.worker-pong";

/** The least time between two sends of one report by one process. */
const REPORT_EVERY_MS = 5 * 60_000;

export interface IncidentReporter {
  /** Never throws and never waits: a report that can't be sent is only logged. */
  report(kind: IncidentKind, detail: string): void;
}

export function createIncidentReporter(queue: JobQueue, logger: Logger): IncidentReporter {
  // One entry per kind and code: a handful, never grows with traffic.
  const lastSent = new Map<string, number>();
  return {
    report(kind, detail) {
      const now = Date.now();
      const key = `${kind}\n${detail.slice(0, 200)}`;
      if ((lastSent.get(key) ?? 0) + REPORT_EVERY_MS > now) return;
      lastSent.set(key, now);
      const window = String(Math.floor(now / REPORT_EVERY_MS));
      queue
        .send(PLATFORM_INCIDENT_QUEUE, { kind, detail: detail.slice(0, 200) }, { id: listenerJobId(key, window) })
        .catch((error: unknown) => {
          logger.warn({ queue: PLATFORM_INCIDENT_QUEUE, ...errorFields(error) }, "An incident couldn't be reported");
        });
    },
  };
}

/** The worker's answer to the console's ping: it is alive and takes jobs. */
export function workerPingHandler(queue: JobQueue): JobHandler {
  return {
    queue: WORKER_PING_QUEUE,
    handle: async (data) => {
      await queue.send(WORKER_PONG_QUEUE, { sentAt: typeof data.sentAt === "string" ? data.sentAt : "" });
    },
  };
}
