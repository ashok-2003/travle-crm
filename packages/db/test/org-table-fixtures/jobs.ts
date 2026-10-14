// Isolation fixtures for the jobs module: the outbox, and the record of which listener handled which event.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  outbox_event: {
    create: (tx) => tx.outboxEvent.create({ data: { type: "isolation.checked", payload: { probe: true } } }),
    appendOnly: true,
    // The one column the runtime role may update: the suite checks row-level security on it, not just the grants.
    updatableColumn: "relayed_at",
  },
  processed_event: {
    create: (tx) =>
      tx.processedEvent.create({
        data: { listener: "isolation.checked", eventId: "0199e7a0-0000-7000-8000-000000000001" },
      }),
    appendOnly: true,
  },
};
