// The money on the dashboard (step 3, P0, reports): quotes accepted in a period and their worth, payments received in
// it, and now, what accepted quotes still have to be paid and how much of it is overdue. The member's own leads' quotes,
// or the agency's for a role that sees all. Live sums under row-level security.
import type { MoneySummary } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { dayOf } from "./quote-rows.js";
import { coveredInstallments } from "./totals.js";

export async function moneySummaryOf(
  tx: OrgTx,
  access: MemberAccess,
  period: { from: string; to: string; today: string },
): Promise<MoneySummary> {
  const lead = scopeFilter(access, "quotes:view", "ownerUserId");
  const start = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${period.to}T23:59:59.999Z`);
  const accepted = await tx.quote.findMany({
    where: { lead, status: "accepted" },
    select: {
      acceptedAt: true,
      totalPaise: true,
      payments: { where: { voidedAt: null }, select: { amountPaise: true, receivedOn: true } },
      installments: { select: { amountPaise: true, dueOn: true } },
    },
  });
  const received = await tx.quotePayment.aggregate({
    where: { voidedAt: null, receivedOn: { gte: start, lte: new Date(`${period.to}T00:00:00Z`) }, quote: { lead } },
    _sum: { amountPaise: true },
  });
  let acceptedCount = 0;
  let acceptedPaise = 0;
  let outstandingPaise = 0;
  let overduePaise = 0;
  let overdueCount = 0;
  for (const quote of accepted) {
    const total = Number(quote.totalPaise);
    const paid = quote.payments.reduce((sum, payment) => sum + Number(payment.amountPaise), 0);
    if (quote.acceptedAt !== null && quote.acceptedAt >= start && quote.acceptedAt <= end) {
      acceptedCount += 1;
      acceptedPaise += total;
    }
    outstandingPaise += Math.max(0, total - paid);
    const dues = coveredInstallments(
      quote.installments.map((due) => ({ amountPaise: Number(due.amountPaise), dueOn: dayOf(due.dueOn) })),
      paid,
    );
    const late = dues.filter((due) => !due.paid && due.dueOn <= period.today);
    if (late.length > 0) {
      overdueCount += 1;
      // What is late is due by today less what was paid beyond the instalments already covered.
      const dueByToday = dues.filter((due) => due.dueOn <= period.today).reduce((sum, due) => sum + due.amountPaise, 0);
      overduePaise += Math.max(0, dueByToday - paid);
    }
  }
  return {
    acceptedCount,
    acceptedPaise,
    receivedPaise: Number(received._sum.amountPaise ?? 0n),
    outstandingPaise,
    overduePaise,
    overdueCount,
  };
}

/** Each lead owner's sales in the period: the quotes accepted in it, before GST, for the team's leaderboard. */
export async function salesByOwner(tx: OrgTx, period: { from: Date; to: Date }): Promise<Map<string, number>> {
  const rows = await tx.quote.findMany({
    where: { status: "accepted", acceptedAt: { gte: period.from, lt: period.to } },
    select: { subtotalPaise: true, lead: { select: { ownerUserId: true } } },
  });
  const sales = new Map<string, number>();
  for (const row of rows) {
    const owner = row.lead.ownerUserId;
    if (owner !== null) sales.set(owner, (sales.get(owner) ?? 0) + Number(row.subtotalPaise));
  }
  return sales;
}
