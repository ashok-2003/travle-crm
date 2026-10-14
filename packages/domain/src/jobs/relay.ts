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
  /** Events relayed per organization in one pass. */
  batchSize?: number;
  /** Organizations looked at in one pass. */
  organizationsPerPass?: number;
  /**
   * Relay only these organizations' events, for example right after a request in one organization. By default the
   * relay asks the database which organizations have events waiting.
   */
  organizationIds?: readonly string[];
}

/** What a listener's job carries: ids only. The listener reads the event inside db.forOrg(). */
export interface ListenerJobData {
  [key: string]: string;
  organizationId: string;
  eventId: string;
  eventType: string;
}

/** Relays one batch of waiting events. Returns how many events it relayed. */
export async function relayOutbox(dependencies: RelayDependencies): Promise<number> {
  const organizationIds =
    dependencies.organizationIds ??
    (await organizationsWithEventsWaiting(dependencies.db, dependencies.organizationsPerPass ?? 50));
  let relayed = 0;
  for (const organizationId of organizationIds) {
    relayed += await relayOrganization(dependencies, organizationId);
  }
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

/**
 * Relays in a loop: straight on while there are events waiting, otherwise every intervalMs (default 1 s). An error
 * goes to onError and the loop carries on, so a database blip doesn't stop the worker's relay.
 */
export function startOutboxRelay(
  dependencies: RelayDependencies & { intervalMs?: number; onError?: (error: unknown) => void },
): OutboxRelay {
  const intervalMs = dependencies.intervalMs ?? 1000;
  const onError =
    dependencies.onError ??
    ((error: unknown) => {
      console.error("outbox relay failed", error);
    });
  const stopping = new AbortController();

  const loop = (async () => {
    while (!stopping.signal.aborted) {
      let relayed = 0;
      try {
        relayed = await relayOutbox(dependencies);
      } catch (error) {
        onError(error);
      }
      // stop() aborts the wait, so stopping never waits out the interval.
      if (relayed === 0) await sleep(intervalMs, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  })();

  return {
    stop: async () => {
      stopping.abort();
      await loop;
    },
  };
}
