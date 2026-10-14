// Isolation fixtures for the jobs module: the outbox.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  outbox_event: {
    create: (tx) => tx.outboxEvent.create({ data: { type: "isolation.checked", payload: { probe: true } } }),
    appendOnly: true,
    // The one column the runtime role may update: the suite checks row-level security on it, not just the grants.
    updatableColumn: "relayed_at",
  },
};
