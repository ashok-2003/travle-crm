// The outbox relay (spec 9.1): after a change commits, it queues one job for each listener of each new event, then
// marks the events relayed. It runs in the worker, in a loop.
import { setTimeout as sleep } from "node:timers/promises";
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { EventListener } from "./events.js";
import { listenerJobId } from "./listener-job-id.js";

export interface RelayDependencies {
  db: Database;
  queue: JobQueue;
  listeners: readonly EventListener[];
  /** Events relayed per organization in one pass (default 100). */
  batchSize?: number;
  /** Organizations looked at in one pass (default 50). */
  organizationsPerPass?: number;
  /**
   * Relay only these organizations' events, for example right after a request in one organization. By default the
   * relay asks the database which organizations have events waiting.
   */
  organizationIds?: readonly string[];
}

/** What a listener's job carries: ids only. The listener reads the event inside db.forOrg(). */
// The index signature stays: the lint rule wants an interface here, and an interface is assignable to the queue's
// JobData (a flat object) only with one. Without it the sends below would not type-check.
export interface ListenerJobData {
  [key: string]: string;
  organizationId: string;
  eventId: string;
  eventType: string;
}

function assertPositiveInteger(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new RangeError(`${name} must be a positive whole number, not ${String(value)}`);
  }
}

function assertLimits({
  batchSize,
  organizationsPerPass,
}: Pick<RelayDependencies, "batchSize" | "organizationsPerPass">): void {
  assertPositiveInteger("batchSize", batchSize);
  assertPositiveInteger("organizationsPerPass", organizationsPerPass);
}

/**
 * Relays one batch of waiting events. Returns how many events it relayed. One failing organization doesn't stop the
 * pass: the others are relayed, and an AggregateError of one error per failed organization (its id in the message, the
 * original as the cause) is thrown at the end. The optional signal ends the pass between organizations.
 */
export async function relayOutbox(dependencies: RelayDependencies, signal?: AbortSignal): Promise<number> {
  assertLimits(dependencies);
  const organizationIds =
    dependencies.organizationIds ??
    (await organizationsWithEventsWaiting(dependencies.db, dependencies.organizationsPerPass ?? 50));
  let relayed = 0;
  const failures: Error[] = [];
  for (const organizationId of organizationIds) {
    if (signal?.aborted) break;
    try {
      relayed += await relayOrganization(dependencies, organizationId);
    } catch (error) {
      failures.push(new Error(`Relaying organization ${organizationId} failed`, { cause: error }));
    }
  }
  if (failures.length > 0)
    throw new AggregateError(failures, `Relaying failed for ${String(failures.length)} organization(s)`);
  return relayed;
}

/**
 * The organizations with events waiting, oldest first: the relay's one look across organizations, through the
 * SECURITY DEFINER function that returns ids only (ADR 0010).
 */
export async function organizationsWithEventsWaiting(db: Database, limit: number): Promise<string[]> {
  const rows = await db.withoutOrg(
    (tx) => tx.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM app_organizations_with_unrelayed_events(${limit}::integer) AS organization_id`,
  );
  return rows.map((row) => row.organization_id);
}

async function relayOrganization(
  { db, queue, listeners, batchSize = 100 }: RelayDependencies,
  organizationId: string,
): Promise<number> {
  return db.forOrg(
    organizationId,
    async (tx) => {
      // SKIP LOCKED: two relays at once (several worker copies) each take different events, never the same one.
      const events = await tx.$queryRaw<{ id: string; type: string }[]>`
        SELECT id, type FROM outbox_event WHERE relayed_at IS NULL
        ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
      for (const event of events) {
        for (const listener of listeners.filter((candidate) => candidate.eventType === event.type)) {
          const data: ListenerJobData = { organizationId, eventId: event.id, eventType: event.type };
          await queue.send(listener.name, data, { id: listenerJobId(listener.name, event.id) });
        }
      }
      if (events.length > 0) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: events.map((event) => event.id) } },
          data: { relayedAt: new Date() },
        });
      }
      return events.length;
    },
    // Sending a batch to pg-boss can take longer than Prisma's default 5 seconds on a busy database.
    { timeout: 30_000 },
  );
}

export interface OutboxRelay {
  /** Finishes the pass in progress, then stops. */
  stop(): Promise<void>;
}

const MAX_BACKOFF_MS = 60_000;

/** How long the relay waits: intervalMs when all is well, doubling after each failed pass in a row, up to a minute. */
export function relayBackoffMs(consecutiveFailures: number, intervalMs: number): number {
  return Math.min(intervalMs * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
}

/**
 * Relays in a loop: straight on while there are events waiting, otherwise every intervalMs (default 1 s). An error
 * goes to onError and the loop carries on, waiting longer after each failed pass in a row (up to a minute), so a
 * database blip or a pg-boss outage doesn't stop the worker's relay or flood the log. A failed pass reports each
 * failing organization's error. An onError that throws is ignored.
 */
export function startOutboxRelay(
  dependencies: RelayDependencies & { intervalMs?: number; onError?: (error: unknown) => void },
): OutboxRelay {
  const intervalMs = dependencies.intervalMs ?? 1000;
  assertPositiveInteger("intervalMs", intervalMs);
  assertLimits(dependencies);
  const onError =
    dependencies.onError ??
    ((error: unknown) => {
      console.error("outbox relay failed", error);
    });
  const report = (error: unknown): void => {
    try {
      onError(error);
    } catch {
      // The relay outlives a broken logger.
    }
  };
  const stopping = new AbortController();

  const loop = (async () => {
    let failures = 0;
    while (!stopping.signal.aborted) {
      let relayed = 0;
      try {
        relayed = await relayOutbox(dependencies, stopping.signal);
        failures = 0;
      } catch (error) {
        failures += 1;
        for (const reported of error instanceof AggregateError ? (error.errors as unknown[]) : [error])
          report(reported);
      }
      // stop() aborts the wait, so stopping never waits out the interval.
      if (relayed === 0) {
        await sleep(relayBackoffMs(failures, intervalMs), undefined, { signal: stopping.signal }).catch(
          () => undefined,
        );
      }
    }
  })();

  return {
    stop: async () => {
      stopping.abort();
      await loop;
    },
  };
}
