// Isolation fixtures for the jobs module: the outbox.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  outbox_event: {
    create: (tx) => tx.outboxEvent.create({ data: { type: "isolation.checked", payload: { probe: true } } }),
    appendOnly: true,
  },
};
