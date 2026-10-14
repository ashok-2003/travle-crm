// Writes a domain event to the outbox, in the caller's transaction: the event exists exactly when the change does.
import type { OrgTx } from "@travel-crm/db";
import { assertEventType, type EventPayload } from "./events.js";

/**
 * Records that something happened, in the same transaction as the change (spec 9.1). The worker's relay queues the
 * event's listeners after the transaction commits; if it rolls back, the event never existed. Returns the event's id.
 */
export async function publishEvent(tx: OrgTx, event: { type: string; payload: EventPayload }): Promise<string> {
  assertEventType(event.type);
  // organization_id is omitted on purpose: it defaults to the transaction's organization.
  const created = await tx.outboxEvent.create({
    data: { type: event.type, payload: event.payload },
    select: { id: true },
  });
  return created.id;
}
