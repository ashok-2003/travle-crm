// Isolation fixtures for the documents module: issued documents, which the runtime role can't change.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  issued_document: {
    create: (tx) =>
      tx.issuedDocument.create({
        data: { template: "sample", number: "ISO-2000-0001", title: "Isolation", renderInput: {} },
      }),
    appendOnly: true,
  },
};
