// The agency's money over a period (step 6, P0): bookings (quotes accepted in it) and their price before GST, the GST on
// them, what they cost, the running costs spent in it, gross and net profit, and what customers paid; and, now, what
// customers still owe and what the agency still owes suppliers; with six months to the period's end, month by month.
// Bookings accepted with no date (none today) count by their last change. Live sums under row-level security.
import { financeSummary, type FinancePeriodInput, type FinanceSummary } from "@travel-crm/contracts/finance";
import type { OrgTx } from "@travel-crm/db";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const endOf = (day: string) => new Date(`${day}T23:59:59.999Z`);
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** The six months to `to`'s month, oldest first, as YYYY-MM. */
function sixMonths(to: string): string[] {
  const [year = 2026, month = 1] = to.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    return monthOf(date);
  });
}

export async function financeSummaryOf(tx: OrgTx, period: FinancePeriodInput): Promise<FinanceSummary> {
  const months = sixMonths(period.to);
  const earliest = new Date(`${months[0] ?? period.from}-01T00:00:00Z`);
  const windowStart = earliest < asDate(period.from) ? earliest : asDate(period.from);
  const accepted = await tx.quote.findMany({
    where: { status: "accepted" },
    select: {
      acceptedAt: true,
      updatedAt: true,
      subtotalPaise: true,
      taxPaise: true,
      totalPaise: true,
      payments: { where: { voidedAt: null }, select: { amountPaise: true } },
      costs: { where: { voidedAt: null }, select: { amountPaise: true, paidOn: true } },
    },
  });
  const expenses = await tx.agencyExpense.findMany({
    where: { voidedAt: null, spentOn: { gte: windowStart, lte: asDate(period.to) } },
    select: { category: true, amountPaise: true, spentOn: true },
  });
  const collected = await tx.quotePayment.aggregate({
    where: { voidedAt: null, receivedOn: { gte: asDate(period.from), lte: asDate(period.to) } },
    _sum: { amountPaise: true },
  });

  const start = asDate(period.from);
  const end = endOf(period.to);
  const perMonth = new Map(months.map((month) => [month, { revenue: 0, tripCost: 0, expense: 0 }]));
  let bookings = 0;
  let revenuePaise = 0;
  let gstPaise = 0;
  let tripCostPaise = 0;
  let receivablePaise = 0;
  let payablePaise = 0;
  for (const quote of accepted) {
    const on = quote.acceptedAt ?? quote.updatedAt;
    const cost = quote.costs.reduce((sum, row) => sum + Number(row.amountPaise), 0);
    const paid = quote.payments.reduce((sum, row) => sum + Number(row.amountPaise), 0);
    receivablePaise += Math.max(0, Number(quote.totalPaise) - paid);
    payablePaise += quote.costs
      .filter((row) => row.paidOn === null)
      .reduce((sum, row) => sum + Number(row.amountPaise), 0);
    if (on >= start && on <= end) {
      bookings += 1;
      revenuePaise += Number(quote.subtotalPaise);
      gstPaise += Number(quote.taxPaise);
      tripCostPaise += cost;
    }
    const month = perMonth.get(monthOf(on));
    if (month) {
      month.revenue += Number(quote.subtotalPaise);
      month.tripCost += cost;
    }
  }
  let expensePaise = 0;
  const byCategory = new Map<string, number>();
  for (const row of expenses) {
    const amount = Number(row.amountPaise);
    const month = perMonth.get(monthOf(row.spentOn));
    if (month) month.expense += amount;
    if (row.spentOn >= start && row.spentOn <= end) {
      expensePaise += amount;
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + amount);
    }
  }
  const grossProfitPaise = revenuePaise - tripCostPaise;
  return financeSummary.parse({
    bookings,
    revenuePaise,
    gstPaise,
    tripCostPaise,
    grossProfitPaise,
    expensePaise,
    netProfitPaise: grossProfitPaise - expensePaise,
    collectedPaise: Number(collected._sum.amountPaise ?? 0n),
    receivablePaise,
    payablePaise,
    expensesByCategory: [...byCategory.entries()]
      .map(([category, amountPaise]) => ({ category, amountPaise }))
      .sort((a, b) => b.amountPaise - a.amountPaise),
    months: months.map((month) => {
      const figures = perMonth.get(month) ?? { revenue: 0, tripCost: 0, expense: 0 };
      return {
        month,
        revenuePaise: figures.revenue,
        tripCostPaise: figures.tripCost,
        expensePaise: figures.expense,
        netProfitPaise: figures.revenue - figures.tripCost - figures.expense,
      };
    }),
  });
}
