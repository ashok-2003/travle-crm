// Isolation fixtures for the catalog module: destinations, which are soft-deleted.
import { randomUUID } from "node:crypto";
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  destination: {
    // A name no other fixture uses: names are unique among an organization's live destinations.
    create: (tx) => tx.destination.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}` } }),
  },
};
