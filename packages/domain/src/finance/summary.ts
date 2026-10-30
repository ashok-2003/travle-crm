// The agency's money over a period (step 6, P0): bookings (quotes accepted in it) and their price before GST, the GST on
// them, what they cost, the running costs spent in it, gross and net profit, and what customers paid; and, now, what
// customers still owe and what the agency still owes suppliers; with six months to the period's end, month by month.
// Every figure is summed by the database (a month at a time), so the screen's cost doesn't grow with the bookings.
// Live sums under row-level security.
import { financeSummary, type FinancePeriodInput, type FinanceSummary } from "@travel-crm/contracts/finance";
import { sql, type OrgTx } from "@travel-crm/db";
import { quoteOwedSql, quoteSalesSql, quoteTaxSql } from "../quotes/index.js";

import { addDays, startOfDayIn, type CalendarDate } from "../kernel/index.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** The six months to `to`'s month, oldest first, as YYYY-MM. */
function sixMonths(to: string): string[] {
  const [year = 2026, month = 1] = to.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    return monthOf(date);
  });
}

interface BookingSums {
  month: string;
  bookings: number;
  revenue: bigint;
  gst: bigint;
  cost: bigint;
}

/** Accepted quotes from `from` up to `before` (acceptance moments, months in the agency's zone), by month: how many, their price, GST and costs. */
const bookingsByMonth = (tx: OrgTx, from: Date, before: Date, timeZone: string) =>
  tx.$queryRaw<BookingSums[]>(sql`
    SELECT to_char(q.accepted_at AT TIME ZONE ${timeZone}, 'YYYY-MM') AS month,
           count(*)::int AS bookings,
           coalesce(sum(${quoteSalesSql}), 0)::bigint AS revenue,
           coalesce(sum(${quoteTaxSql}), 0)::bigint AS gst,
           coalesce(sum(c.cost), 0)::bigint AS cost
    FROM quote q
    LEFT JOIN LATERAL (
      SELECT sum(amount_paise) AS cost FROM trip_cost WHERE quote_id = q.id AND voided_at IS NULL
    ) c ON true
    WHERE q.status = 'accepted' AND q.deleted_at IS NULL AND q.accepted_at >= ${from} AND q.accepted_at < ${before}
    GROUP BY 1`);

export async function financeSummaryOf(
  tx: OrgTx,
  period: FinancePeriodInput,
  timeZone: string,
): Promise<FinanceSummary> {
  const months = sixMonths(period.to);
  // Booking moments are cut at the agency's midnights, as Reports cuts them; dated figures (payments, expenses) are days.
  const zoned = (day: string) => startOfDayIn(day as CalendarDate, timeZone);
  const earliest = zoned(`${months[0] ?? period.from.slice(0, 7)}-01`);
  const windowStart = earliest < zoned(period.from) ? earliest : zoned(period.from);
  const start = asDate(period.from);
  const end = zoned(addDays(period.to as CalendarDate, 1));
  const dayWindowStart = new Date(`${months[0] ?? period.from.slice(0, 7)}-01T00:00:00Z`);
  const [monthly, inPeriod, owed, supplierOwed, collected, refunded, expenseMonths, expenseCategories] =
    await Promise.all([
      bookingsByMonth(tx, windowStart, end, timeZone),
      bookingsByMonth(tx, zoned(period.from), end, timeZone),
      // What customers owe: the accepted quotes' totals less what was paid on them (a payment never passes its total).
      // (a cancelled booking owes its charge, not the trip's total, and never more than that.)
      tx.$queryRaw<{ total: bigint; paid: bigint }[]>(sql`
      SELECT coalesce(sum(GREATEST(0, ${quoteOwedSql} - coalesce(p.paid, 0))), 0)::bigint AS total,
             0::bigint AS paid
      FROM quote q
      LEFT JOIN LATERAL (
        SELECT sum(amount_paise) AS paid FROM quote_payment WHERE quote_id = q.id AND voided_at IS NULL
      ) p ON true
      WHERE q.status = 'accepted' AND q.deleted_at IS NULL`),
      tx.$queryRaw<{ owed: bigint }[]>`
      SELECT coalesce(sum(c.amount_paise), 0)::bigint AS owed
      FROM trip_cost c JOIN quote q ON q.id = c.quote_id
      WHERE q.status = 'accepted' AND q.deleted_at IS NULL AND c.voided_at IS NULL AND c.paid_on IS NULL`,
      tx.quotePayment.aggregate({
        where: { voidedAt: null, receivedOn: { gte: start, lte: asDate(period.to) } },
        _sum: { amountPaise: true },
      }),
      // Refunds paid in the period come off the cash collected.
      tx.bookingRefund.aggregate({
        where: { status: "refunded", refundedOn: { gte: start, lte: asDate(period.to) } },
        _sum: { amountPaise: true },
      }),
      tx.agencyExpense.groupBy({
        by: ["spentOn"],
        where: {
          voidedAt: null,
          spentOn: { gte: dayWindowStart < start ? dayWindowStart : start, lte: asDate(period.to) },
        },
        _sum: { amountPaise: true },
      }),
      tx.agencyExpense.groupBy({
        by: ["category"],
        where: { voidedAt: null, spentOn: { gte: start, lte: asDate(period.to) } },
        _sum: { amountPaise: true },
      }),
    ]);

  const perMonth = new Map(months.map((month) => [month, { revenue: 0, tripCost: 0, expense: 0 }]));
  for (const row of monthly) {
    const figures = perMonth.get(row.month);
    if (figures) {
      figures.revenue += Number(row.revenue);
      figures.tripCost += Number(row.cost);
    }
  }
  for (const row of expenseMonths) {
    const figures = perMonth.get(monthOf(row.spentOn));
    if (figures) figures.expense += Number(row._sum.amountPaise ?? 0n);
  }
  const sum = (rows: BookingSums[], pick: (row: BookingSums) => bigint | number) =>
    rows.reduce((total, row) => total + Number(pick(row)), 0);
  const revenuePaise = sum(inPeriod, (row) => row.revenue);
  const tripCostPaise = sum(inPeriod, (row) => row.cost);
  const expensesByCategory = expenseCategories
    .map((row) => ({ category: row.category, amountPaise: Number(row._sum.amountPaise ?? 0n) }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
  const expensePaise = expensesByCategory.reduce((total, row) => total + row.amountPaise, 0);
  const grossProfitPaise = revenuePaise - tripCostPaise;
  return financeSummary.parse({
    bookings: sum(inPeriod, (row) => row.bookings),
    revenuePaise,
    gstPaise: sum(inPeriod, (row) => row.gst),
    tripCostPaise,
    grossProfitPaise,
    expensePaise,
    netProfitPaise: grossProfitPaise - expensePaise,
    collectedPaise: Number(collected._sum.amountPaise ?? 0n) - Number(refunded._sum.amountPaise ?? 0n),
    receivablePaise: Math.max(0, Number(owed[0]?.total ?? 0n) - Number(owed[0]?.paid ?? 0n)),
    payablePaise: Number(supplierOwed[0]?.owed ?? 0n),
    expensesByCategory,
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
