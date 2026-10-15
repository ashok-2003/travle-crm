// Isolation fixtures for the document-number counters.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  org_counter: { create: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }) },
};
