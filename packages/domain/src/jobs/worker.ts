// The worker (spec 9.1): runs every listener, plain job handler and scheduled job, and the outbox relay. The api's
// `worker` command builds the adapters and calls startWorker; it also stops the job runner it built.
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
  /** Where the relay's errors go. Job failures go to the runner's retries and failed list instead. */
  onError?: (error: unknown) => void;
}

export interface Worker {
  /** Stops the relay after its current pass. Stop the runner (pg-boss) afterwards; it finishes running jobs. */
  stop(): Promise<void>;
}

function assertTimeZone(timeZone: string, queue: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new RangeError(`Schedule ${queue} has an unknown time zone ${JSON.stringify(timeZone)}`);
  }
}

export async function startWorker(dependencies: WorkerDependencies): Promise<Worker> {
  const { db, runner, queue, listeners, handlers = [], schedules = [] } = dependencies;
  const queues = [
    ...listeners.map((listener) => listener.name),
    ...handlers.map((handler) => handler.queue),
    ...schedules.map((schedule) => schedule.queue),
  ];
  const repeated = queues.filter((name, index) => queues.indexOf(name) !== index);
  if (repeated.length > 0) throw new Error(`Two kinds of work share the queue ${repeated.join(", ")}`);
  for (const schedule of schedules) assertTimeZone(schedule.timeZone, schedule.queue);

  for (const listener of listeners) {
    await runner.work(listener.name, async (job) => {
      await runListenerJob({ db, listener, data: job.data });
    });
  }
  for (const handler of handlers) {
    await runner.work(handler.queue, (job) => handler.handle(job.data));
  }
  for (const schedule of schedules) {
    await runner.work(schedule.queue, (job) => schedule.handle(job.data));
    await runner.schedule(schedule.queue, schedule.cron, {
      timeZone: schedule.timeZone,
      ...(schedule.data === undefined ? {} : { data: schedule.data }),
    });
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
