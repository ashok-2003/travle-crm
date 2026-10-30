// Isolation fixtures for the suppliers module: a supplier, which is soft-deleted so the runtime role deletes none, and its
// contacts, which are plain data it may delete.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aSupplier = (tx: OrgTx) =>
  tx.supplier.create({ data: { kind: "hotel", name: `Isolation hotel ${randomUUID()}` } });

export const fixtures: OrgTableFixtures = {
  supplier: { create: aSupplier, undeletable: true },
  supplier_contact: {
    create: async (tx) =>
      tx.supplierContact.create({ data: { supplierId: (await aSupplier(tx)).id, name: "Isolation contact" } }),
  },
};
