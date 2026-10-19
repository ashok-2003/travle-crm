// Domain events and their listeners (spec 9.1): the contract between the modules that publish events and the worker
// that runs listeners. Calls go down the layers; events go up through the outbox (spec 8).
import type { ForOrgOptions, OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";

/** A JSON value, as an event payload holds it. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Ids and small facts a listener needs. Listeners read anything else themselves, inside db.forOrg(). */
export type EventPayload = Readonly<Record<string, JsonValue>>;

/** Something that happened in one organization, such as "document.issued". */
export interface DomainEvent<Payload = EventPayload> {
  readonly id: string;
  readonly organizationId: string;
  readonly type: string;
  readonly payload: Payload;
  readonly occurredAt: Date;
}

/** What a listener gets besides the event. The worker builds it for the event's organization. */
export interface ListenerContext {
  /** The worker acting in the event's organization (source "job"), for the audit log. */
  readonly actor: Actor;
  /**
   * Runs fn in one transaction in the event's organization. Keep slow work (rendering, uploading, sending) outside
   * it: a transaction holds a database connection while it runs. A listener whose one transaction must run longer
   * than the database's limit (a lead add's batch of 50 rows) asks for its own (X1).
   */
  forOrg<T>(fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
}

/**
 * Reacts to one type of event. The worker runs it at least once per event (spec 9.1): a failed run is retried with
 * backoff, and a crashed or overlapping run can repeat one that worked. Key database writes on the event's id (a
 * unique key, like notify's sourceEventId), so a repeat adds nothing; other work (an email, an upload) may repeat, so
 * make it safe to repeat.
 */
export interface EventListener {
  /** Unique, and the name of the listener's job queue: "<module>.<what it does>", e.g. "documents.render-pdf". */
  readonly name: string;
  readonly eventType: string;
  handle(event: DomainEvent, context: ListenerContext): Promise<void>;
}

/** Anything that checks an unknown value and returns it typed, such as a Zod schema from @travel-crm/contracts. */
export interface PayloadSchema<Payload> {
  parse(value: unknown): Payload;
}

/** "<entity>.<what happened>", e.g. "document.issued". The outbox table checks the same pattern. */
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export function assertEventType(type: string): void {
  if (!EVENT_TYPE_PATTERN.test(type)) {
    throw new RangeError(`Event types look like "document.issued", got ${JSON.stringify(type)}`);
  }
}

/** "<module>.<what it does>", e.g. "documents.render-pdf": the listener's job queue name. */
function assertListenerName(name: string): void {
  if (!EVENT_TYPE_PATTERN.test(name)) {
    throw new RangeError(`Listener names look like "documents.render-pdf", got ${JSON.stringify(name)}`);
  }
}

/** A listener whose handler gets the payload checked and typed by `payload`, which throws on a malformed one. */
export function defineListener<Payload>(definition: {
  name: string;
  eventType: string;
  payload: PayloadSchema<Payload>;
  handle(event: DomainEvent<Payload>, context: ListenerContext): Promise<void>;
}): EventListener {
  assertListenerName(definition.name);
  assertEventType(definition.eventType);
  return {
    name: definition.name,
    eventType: definition.eventType,
    // async, so a malformed payload rejects like any other failure instead of throwing at the caller.
    handle: async (event, context) => {
      await definition.handle({ ...event, payload: definition.payload.parse(event.payload) }, context);
    },
  };
}
