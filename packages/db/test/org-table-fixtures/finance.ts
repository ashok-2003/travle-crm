// Isolation fixtures for the finance module: a booking's cost and an agency expense. Both are voided, never deleted, so
// the runtime role deletes neither.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aQuote = async (tx: OrgTx) =>
  tx.quote.create({
    data: {
      leadId: (
        await tx.lead.create({
          data: {
            personId: (
              await tx.person.create({ data: { name: "Isolation person", email: `cost-${randomUUID()}@example.test` } })
            ).id,
            source: "walk_in",
          },
        })
      ).id,
      title: "Isolation booking",
    },
  });

export const fixtures: OrgTableFixtures = {
  trip_cost: {
    create: async (tx) =>
      tx.tripCost.create({
        data: { quoteId: (await aQuote(tx)).id, category: "hotel", supplier: "Isolation hotel", amountPaise: 500_00n },
      }),
    undeletable: true,
  },
  agency_expense: {
    create: (tx) =>
      tx.agencyExpense.create({
        data: {
          category: "rent",
          description: "Isolation rent",
          amountPaise: 500_00n,
          spentOn: new Date("2026-11-01"),
        },
      }),
    undeletable: true,
  },
};
