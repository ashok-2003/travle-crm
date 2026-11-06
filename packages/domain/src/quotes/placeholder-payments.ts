// The money paid on a quote made from a chat (an AI booking's stand-in, release 6) moves to the real quote accepted in its
// place, so the booking never shows less paid than the customer paid. A quote smaller than that money is never accepted:
// the money would have nowhere to go, so the person fixes the quote first.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";

const sumOf = (rows: readonly { amountPaise: bigint }[]) =>
  rows.reduce((total, row) => total + Number(row.amountPaise), 0);

/** The lead's chat-made booking's stand-in quote (other than this one) and its live payments, or null when there is none. */
async function standInOf(tx: OrgTx, leadId: string, quoteId: string) {
  const booking = await tx.booking.findFirst({
    where: {
      leadId,
      quotePlaceholder: true,
      status: { in: ["requested", "confirmed"] },
      quoteId: { not: quoteId },
    },
    select: { quoteId: true },
  });
  if (booking === null) return null;
  const payments = await tx.quotePayment.findMany({
    where: { quoteId: booking.quoteId, voidedAt: null },
    orderBy: { id: "asc" },
    select: { id: true, amountPaise: true },
  });
  return { quoteId: booking.quoteId, payments };
}

const tooSmall = () =>
  new DomainError(
    "CONFLICT",
    "QUOTE_BELOW_PAID",
    "The customer already paid more than this quote's total on their booking; change the quote's total first",
  );

/**
 * Refuses to accept (or take money on) a quote when what was paid on the lead's chat-made quote, which would move to it,
 * with what it holds already and what is being paid now, comes to more than its total.
 */
export async function assertTakesStandInPayments(tx: OrgTx, quoteId: string, payingPaise = 0): Promise<void> {
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: { leadId: true, totalPaise: true, payments: { where: { voidedAt: null }, select: { amountPaise: true } } },
  });
  const standIn = await standInOf(tx, quote.leadId, quoteId);
  if (standIn === null) return;
  if (sumOf(standIn.payments) + sumOf(quote.payments) + payingPaise > Number(quote.totalPaise)) throw tooSmall();
}

/**
 * Moves the stand-in quote's live payments (their receipts and claims stay on them) to the quote accepted in its place, in
 * the caller's transaction, audited with ids and amounts. Refused when they would come to more than the quote's total.
 */
export async function moveStandInPayments(
  tx: OrgTx,
  actor: Actor,
  input: { fromQuoteId: string; toQuoteId: string },
): Promise<void> {
  // Money recorded on the stand-in locks it first (findQuoteForChange), so a payment racing this move waits, then finds
  // the stand-in replaced; without this lock it could land after the read and stay behind on a replaced quote.
  await tx.$queryRaw`SELECT id FROM quote WHERE id = ${input.fromQuoteId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  const moving = await tx.quotePayment.findMany({
    where: { quoteId: input.fromQuoteId, voidedAt: null },
    orderBy: { id: "asc" },
    select: { id: true, amountPaise: true },
  });
  if (moving.length === 0) return;
  const target = await tx.quote.findUniqueOrThrow({
    where: { id: input.toQuoteId },
    select: { totalPaise: true, payments: { where: { voidedAt: null }, select: { amountPaise: true } } },
  });
  if (sumOf(moving) + sumOf(target.payments) > Number(target.totalPaise)) throw tooSmall();
  await tx.quotePayment.updateMany({
    where: { id: { in: moving.map((payment) => payment.id) }, quoteId: input.fromQuoteId },
    data: { quoteId: input.toQuoteId },
  });
  await recordAudit(tx, actor, {
    action: "quote.payments-moved",
    entityType: "quote",
    entityId: input.toQuoteId,
    before: { quoteId: input.fromQuoteId },
    after: {
      quoteId: input.toQuoteId,
      payments: moving.map((payment) => ({ paymentId: payment.id, amountPaise: Number(payment.amountPaise) })),
    },
  });
}
