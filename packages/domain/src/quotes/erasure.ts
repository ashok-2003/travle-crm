// What the quotes keep about a person, emptied when the customer is erased (R38): the name they typed to accept, the free
// notes written on their quotes, and the words they or the agency wrote on a payment's reference. The amounts, dates and
// plans stay (the agency's books), and so do the issued invoices and receipts, which tax law keeps.
import type { OrgTx } from "@travel-crm/db";

export interface QuotesErased {
  quotes: number;
  payments: number;
}

/** Empties the personal words on the quotes of these leads and the references of their payments. Run on the platform's transaction. */
export async function eraseQuoteParts(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[] },
): Promise<QuotesErased> {
  const { organizationId, leadIds } = input;
  const quotes = await tx.quote.updateMany({
    where: { organizationId, leadId: { in: [...leadIds] } },
    data: { acceptedName: null, notes: "" },
  });
  const payments = await tx.quotePayment.updateMany({
    where: { organizationId, quote: { leadId: { in: [...leadIds] } } },
    data: { reference: "" },
  });
  return { quotes: quotes.count, payments: payments.count };
}
