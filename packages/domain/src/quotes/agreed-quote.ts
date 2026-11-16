// A quote made from what a chat agreed (the AI's booking, release 6): the customer said yes to a trip before any quote was
// sent, so the agency's booking needs one to stand on (money lives on quotes). It is accepted at once, with one line for the
// trip, and no tax; a real quote accepted later replaces it. Made as the system, for whoever may confirm the AI's booking.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

export async function agreedQuote(
  tx: OrgTx,
  actor: Actor,
  input: { leadId: string; title: string; travellers: number; notes: string; amountPaise: number },
  now: Date,
): Promise<string> {
  const items =
    input.amountPaise > 0
      ? [{ description: input.title.slice(0, 200), detail: "", quantity: 1, unitPricePaise: input.amountPaise }]
      : [];
  const quote = await tx.quote.create({
    data: {
      leadId: input.leadId,
      title: input.title.slice(0, 120),
      adults: input.travellers,
      children: 0,
      items,
      notes: input.notes.slice(0, 3000),
      taxRateBasisPoints: 0,
      subtotalPaise: BigInt(input.amountPaise),
      totalPaise: BigInt(input.amountPaise),
      status: "accepted",
      sentAt: now,
      acceptedAt: now,
      createdBy: actor.userId,
    },
    select: { id: true },
  });
  await recordAudit(tx, actor, {
    action: "quote.created",
    entityType: "quote",
    entityId: quote.id,
    after: { status: "accepted", totalPaise: input.amountPaise, source: "ai-booking" },
  });
  return quote.id;
}

/**
 * A quote made from a chat grows to hold money a person confirmed beyond it: its one line and total become what was paid
 * plus this payment. Only a quote a person made refuses more than its total; this one only stands in for it.
 */
export async function raiseAgreedQuote(
  tx: OrgTx,
  actor: Actor,
  input: { quoteId: string; payingPaise: number },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM quote WHERE id = ${input.quoteId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: input.quoteId },
    select: { title: true, totalPaise: true, payments: { where: { voidedAt: null }, select: { amountPaise: true } } },
  });
  const needed = quote.payments.reduce((total, row) => total + Number(row.amountPaise), 0) + input.payingPaise;
  if (needed <= Number(quote.totalPaise)) return;
  await tx.quote.update({
    where: { id: input.quoteId },
    data: {
      items: [{ description: quote.title.slice(0, 200), detail: "", quantity: 1, unitPricePaise: needed }],
      subtotalPaise: BigInt(needed),
      totalPaise: BigInt(needed),
      version: { increment: 1 },
    },
  });
  await recordAudit(tx, actor, {
    action: "quote.changed",
    entityType: "quote",
    entityId: input.quoteId,
    before: { totalPaise: Number(quote.totalPaise) },
    after: { totalPaise: needed, source: "ai-booking" },
  });
}
