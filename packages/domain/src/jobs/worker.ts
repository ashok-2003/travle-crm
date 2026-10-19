// The worker (spec 9.1): runs every listener, plain job handler and scheduled job, and the outbox relay. The api's
// `worker` command builds the adapters and calls startWorker; it also stops the job runner it built. The console
// process, which has no listeners, starts only its handlers and schedules (startJobHandlers).
import type { Database } from "@travel-crm/db";
import type { JobData, JobQueue, JobRunner } from "@travel-crm/integrations/jobs";
import type { EventListener } from "./events.js";
import { startOutboxRelay } from "./relay.js";
import { runListenerJob } from "./run-listener.js";

/**
 * Work on a queue that isn't a domain event, such as a webhook to process (no organization is known yet). Its job
 * data holds ids; the handler reads the rest and enters the right organization itself.
 */
export interface JobHandler {
  readonly queue: string;
  handle(data: JobData): Promise<void>;
}

/** A job the runner starts on a cron schedule, read in an IANA time zone, e.g. "15 2 * * *" in "Asia/Kolkata". */
export interface ScheduledJob {
  readonly queue: string;
  readonly cron: string;
  readonly timeZone: string;
  readonly data?: JobData;
  handle(data: JobData): Promise<void>;
}

export interface WorkerDependencies {
  db: Database;
  /** Runs handlers for queues; pg-boss in the worker. */
  runner: JobRunner;
  /** Where the relay queues listeners' jobs; the same pg-boss. */
  queue: JobQueue;
  listeners: readonly EventListener[];
  handlers?: readonly JobHandler[];
  schedules?: readonly ScheduledJob[];
  relay?: {
    /** Wait between relay passes that found nothing (default 1 s). */
    intervalMs?: number;
    /** Relay only these organizations. Tests only: by default the relay finds every organization's events. */
    organizationIds?: readonly string[];
  };
  /**
   * Where the relay's errors go, and reports of jobs whose event wasn't found. Each is an Error whose message is ids
   * only, written by this module, with the original (if any) as its cause. Job failures go to the runner's retries and
   * failed list instead.
   */
  onError?: (error: unknown) => void;
}

/** A process's plain handlers and schedules, without listeners: what the console process runs. */
export interface JobHandlerDependencies {
  runner: JobRunner;
  handlers?: readonly JobHandler[];
  schedules?: readonly ScheduledJob[];
}

export interface Worker {
  /** Stops the relay after its current pass. Stop the runner (pg-boss) afterwards; it finishes running jobs. */
  stop(): Promise<void>;
}

/** Five space-separated fields of digits, names and the usual cron symbols; pg-boss checks the rest on schedule(). */
function assertCron(cron: string, queue: string): void {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || !fields.every((field) => /^[0-9A-Za-z*/,\-?#]+$/.test(field))) {
    throw new RangeError(`Schedule ${queue} has an invalid cron expression ${JSON.stringify(cron)}`);
  }
}

function assertTimeZone(timeZone: string, queue: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new RangeError(`Schedule ${queue} has an unknown time zone ${JSON.stringify(timeZone)}`);
  }
}

/** Refuses two kinds of work on one queue, and a schedule pg-boss couldn't read, before anything is registered. */
function assertWiring(queues: readonly string[], schedules: readonly ScheduledJob[]): void {
  const repeated = queues.filter((name, index) => queues.indexOf(name) !== index);
  if (repeated.length > 0) throw new Error(`Two kinds of work share the queue ${repeated.join(", ")}`);
  for (const schedule of schedules) {
    assertCron(schedule.cron, schedule.queue);
    assertTimeZone(schedule.timeZone, schedule.queue);
  }
}

/**
 * The runner may refuse a schedule (a cron it can't read); the schedules registered before it stay in the runner until
 * the next start reconciles them.
 */
async function registerSchedules(runner: JobRunner, schedules: readonly ScheduledJob[]): Promise<void> {
  for (const schedule of schedules) {
    await runner.work(schedule.queue, (job) => schedule.handle(job.data));
    await runner.schedule(schedule.queue, schedule.cron, {
      timeZone: schedule.timeZone,
      ...(schedule.data === undefined ? {} : { data: schedule.data }),
    });
  }
}

/**
 * Starts everything. The runner (pg-boss) keeps its queues and schedules after a restart: a listener or schedule
 * removed from the code leaves its queue, jobs and schedule behind until a super admin removes it in the console.
 */
export async function startWorker(dependencies: WorkerDependencies): Promise<Worker> {
  const { db, runner, queue, listeners, handlers = [], schedules = [] } = dependencies;
  assertWiring(
    [
      ...listeners.map((listener) => listener.name),
      ...handlers.map((handler) => handler.queue),
      ...schedules.map((schedule) => schedule.queue),
    ],
    schedules,
  );
  // Schedules first: when the runner refuses one, no listener or relay has started.
  await registerSchedules(runner, schedules);
  for (const listener of listeners) {
    // One job of a listener at a time in a worker: an import's read peaks at about 344 MB in its process (X10), so
    // two at once could pass a small host's memory. More workers run more.
    await runner.work(
      listener.name,
      async (job) => {
        const outcome = await runListenerJob({ db, listener, data: job.data });
        // Not retried (the event won't appear), but not silent either. Ids only: this may reach logs.
        if (outcome === "event-not-found") {
          try {
            dependencies.onError?.(
              new Error(
                `${listener.name}: event ${String(job.data.eventId)} not found in organization ${String(job.data.organizationId)}`,
              ),
            );
          } catch {
            // A broken logger must not turn "not found, don't retry" into a retry.
          }
        }
      },
      { concurrency: 1 },
    );
  }
  for (const handler of handlers) {
    await runner.work(handler.queue, (job) => handler.handle(job.data));
  }

  const relay = startOutboxRelay({
    db,
    queue,
    listeners,
    ...(dependencies.relay?.intervalMs === undefined ? {} : { intervalMs: dependencies.relay.intervalMs }),
    ...(dependencies.relay?.organizationIds === undefined
      ? {}
      : { organizationIds: dependencies.relay.organizationIds }),
    ...(dependencies.onError === undefined ? {} : { onError: dependencies.onError }),
  });
  return { stop: () => relay.stop() };
}

/**
 * Starts plain handlers and schedules only: no listeners and no outbox relay. The worker's relay is the one that
 * knows every listener; a relay that knew none would mark each event relayed with nothing queued for it. Stop the
 * runner to stop them.
 */
export async function startJobHandlers(dependencies: JobHandlerDependencies): Promise<void> {
  const { runner, handlers = [], schedules = [] } = dependencies;
  assertWiring(
    [...handlers.map((handler) => handler.queue), ...schedules.map((schedule) => schedule.queue)],
    schedules,
  );
  await registerSchedules(runner, schedules);
  for (const handler of handlers) {
    await runner.work(handler.queue, (job) => handler.handle(job.data));
  }
}
