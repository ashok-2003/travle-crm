// Isolation fixtures for the imports module: a batch, a column, a value match, a row, a remembered header match and a
// stop request. The runtime role deletes rows and value matches when a check runs again, never batches, columns or
// header matches, and only adds stop requests.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aBatch = (tx: OrgTx) =>
  tx.importBatch.create({
    data: {
      kind: "leads",
      fileName: "isolation.csv",
      fileKind: "csv",
      startedBy: "0199e7a0-0000-7000-8000-0000000000b1",
      keepUntil: new Date(),
    },
  });

export const fixtures: OrgTableFixtures = {
  import_batch: { create: aBatch, undeletable: true },
  import_column: {
    create: async (tx) =>
      tx.importColumn.create({ data: { batchId: (await aBatch(tx)).id, position: 0, header: "Name" } }),
    undeletable: true,
  },
  import_value_match: {
    create: async (tx) =>
      tx.importValueMatch.create({
        data: { batchId: (await aBatch(tx)).id, field: "stage", value: "Booked", target: "won", matchedBy: "word" },
      }),
  },
  import_row: {
    create: async (tx) => tx.importRow.create({ data: { batchId: (await aBatch(tx)).id, rowNumber: 2, plan: "new" } }),
  },
  import_header_match: {
    // A key no other fixture uses, since every fixture may run in one organization.
    create: (tx) =>
      tx.importHeaderMatch.create({ data: { kind: "leads", headerKey: `isolation${randomUUID()}`, field: "name" } }),
    undeletable: true,
  },
  import_stop_request: {
    create: async (tx) => tx.importStopRequest.create({ data: { batchId: (await aBatch(tx)).id } }),
    appendOnly: true,
  },
};
