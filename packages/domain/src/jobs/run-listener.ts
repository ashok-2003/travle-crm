// Runs one listener on one event, in the event's organization (spec 9.1). A run that finds the event already handled
// skips it, but two runs can still overlap or repeat after a crash: listeners run at least once. The worker calls it
// for each job the relay queued.
import type { Database } from "@travel-crm/db";
import type { JobData } from "@travel-crm/integrations/jobs";
import { isUuid, systemActor } from "../kernel/index.js";
import type { DomainEvent, EventListener, EventPayload } from "./events.js";
import type { ListenerJobData } from "./relay.js";

export type ListenerRunOutcome = "handled" | "already-handled" | "event-not-found";

/** The job's data as the relay wrote it. A job that doesn't match its listener is a bug, so it fails loudly. */
function listenerJobData(data: JobData, listener: EventListener): ListenerJobData {
  const { organizationId, eventId, eventType } = data;
  if (typeof organizationId !== "string" || !isUuid(organizationId)) {
    throw new TypeError(`${listener.name} job has no valid organizationId`);
  }
  if (typeof eventId !== "string" || !isUuid(eventId)) {
    throw new TypeError(`${listener.name} job has no valid eventId`);
  }
  if (eventType !== listener.eventType) {
    throw new TypeError(`${listener.name} listens to ${listener.eventType}, not ${String(eventType)}`);
  }
  return { organizationId, eventId, eventType };
}

/** The table's CHECK makes every payload an object; anything else here means the row was changed by hand. */
function eventPayload(value: unknown): EventPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("An outbox event's payload must be a JSON object");
  }
  return value as EventPayload;
}

/**
 * Runs listener on the job's event unless it already has. The event is read inside forOrg(job's organization), so a
 * job naming the wrong organization finds nothing ("event-not-found", not retried). The listener runs outside any
 * transaction, with a forOrg of its own for its writes; then the run is recorded. A listener that throws rejects,
 * and the job is retried with backoff.
 *
 * At least once, not exactly once: the check, the listener's work and the record are separate transactions, so a crash
 * after the work, or a second delivery of the job (pg-boss re-dispatches a job still running after its expiry, 15 minutes by default, and each expiry uses a retry), runs the
 * listener again, and two runs may overlap. Key the listener's database writes on event.id (unique constraints,
 * upserts) as well as anything outside the database.
 */
export async function runListenerJob({
  db,
  listener,
  data,
}: {
  db: Database;
  listener: EventListener;
  data: JobData;
}): Promise<ListenerRunOutcome> {
  const job = listenerJobData(data, listener);
  const found = await db.forOrg(job.organizationId, async (tx) => {
    const processed = await tx.processedEvent.findUnique({
      where: {
        organizationId_listener_eventId: {
          organizationId: job.organizationId,
          listener: listener.name,
          eventId: job.eventId,
        },
      },
    });
    if (processed) return "already-handled" as const;
    return (await tx.outboxEvent.findUnique({ where: { id: job.eventId } })) ?? ("event-not-found" as const);
  });
  if (typeof found === "string") return found;

  if (found.type !== listener.eventType) {
    throw new TypeError(`${listener.name} listens to ${listener.eventType}, but event ${found.id} is ${found.type}`);
  }
  const event: DomainEvent = {
    id: found.id,
    organizationId: found.organizationId,
    type: found.type,
    payload: eventPayload(found.payload),
    occurredAt: found.occurredAt,
  };
  await listener.handle(event, {
    actor: systemActor(job.organizationId),
    forOrg: (fn) => db.forOrg(job.organizationId, fn),
  });
  // skipDuplicates: if two runs raced, the second record is a no-op rather than an error that would retry the job.
  await db.forOrg(job.organizationId, (tx) =>
    tx.processedEvent.createMany({ data: [{ listener: listener.name, eventId: job.eventId }], skipDuplicates: true }),
  );
  return "handled";
}
