// Isolation fixtures for the quotes module: a quote, an instalment due on it, a payment on it and the quote settings.
// A quote is soft-deleted, a payment voided and the settings replaced, so the runtime role deletes none of them; an
// instalment it may delete.
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
              await tx.person.create({
                data: { name: "Isolation person", email: `quote-${randomUUID()}@example.test` },
              })
            ).id,
            source: "walk_in",
          },
        })
      ).id,
      title: "Isolation quote",
    },
  });

export const fixtures: OrgTableFixtures = {
  quote: { create: aQuote, undeletable: true },
  quote_installment: {
    create: async (tx) =>
      tx.quoteInstallment.create({
        data: { quoteId: (await aQuote(tx)).id, label: "Advance", amountPaise: 100_00n, dueOn: new Date("2026-11-01") },
      }),
  },
  quote_payment: {
    create: async (tx) =>
      tx.quotePayment.create({
        data: {
          quoteId: (await aQuote(tx)).id,
          amountPaise: 100_00n,
          receivedOn: new Date("2026-11-01"),
          method: "upi",
        },
      }),
    undeletable: true,
  },
  quote_settings: { create: (tx) => tx.quoteSettings.create({ data: { upiId: "isolation@bank" } }), undeletable: true },
};
