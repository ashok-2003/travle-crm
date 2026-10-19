// Isolation fixtures for the exports module: an export. The runtime role never deletes one; the sweep marks it expired.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  data_export: {
    create: (tx) =>
      tx.dataExport.create({
        data: { kind: "leads", format: "xlsx", filter: {}, requestedBy: "0199e7a0-0000-7000-8000-0000000000b2" },
      }),
    undeletable: true,
  },
};
