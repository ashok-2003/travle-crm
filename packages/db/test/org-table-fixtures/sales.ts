// Isolation fixtures for sales execution: a hot signal and a ready package. The runtime role deletes neither, and
// changes no signal.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aLead = async (tx: OrgTx) =>
  tx.lead.create({
    data: {
      personId: (
        await tx.person.create({ data: { name: "Isolation person", email: `sales-${randomUUID()}@example.test` } })
      ).id,
      source: "walk_in",
    },
  });

export const fixtures: OrgTableFixtures = {
  lead_signal: {
    create: async (tx) =>
      tx.leadSignal.create({
        data: { leadId: (await aLead(tx)).id, kind: "asked_price", sourceKey: randomUUID(), at: new Date() },
      }),
    appendOnly: true,
  },
  quote_template: {
    create: (tx) => tx.quoteTemplate.create({ data: { name: `Isolation ${randomUUID().slice(0, 8)}`, title: "Trip" } }),
    undeletable: true,
  },
};
