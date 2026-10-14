// Helpers for the notifications tests: people acting in an organization, and the events notify() published.
import { randomUUID } from "node:crypto";
import type { Database } from "@travel-crm/db";
import type { DomainEvent } from "../../src/jobs/index.js";
import type { Person } from "../../src/notifications/index.js";

/** A member acting in the web app, as the bell's functions see them. */
export function personIn(organizationId: string, userId: string = randomUUID()): Person {
  return { organizationId, userId, source: "web", impersonatedBy: null };
}

/** The organization's unrelayed events of one type, oldest first, as the worker would hand them to a listener. */
export async function eventsOfType(db: Database, organizationId: string, type: string): Promise<DomainEvent[]> {
  const rows = await db.forOrg(organizationId, (tx) =>
    tx.outboxEvent.findMany({ where: { type, relayedAt: null }, orderBy: { id: "asc" } }),
  );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    payload: row.payload as DomainEvent["payload"],
    occurredAt: row.occurredAt,
  }));
}
