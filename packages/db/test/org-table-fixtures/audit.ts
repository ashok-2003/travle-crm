// Isolation fixtures for the audit log.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  audit_entry: {
    create: (tx) =>
      tx.auditEntry.create({
        data: {
          source: "job",
          action: "isolation.checked",
          entityType: "isolation",
          entityId: "0199e7a0-0000-7000-8000-0000000000a1",
        },
      }),
    appendOnly: true,
  },
};
