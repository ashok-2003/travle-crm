"use client";

// Finance's reads and changes (step 6, P0), and the periods the screen offers, worked out in the agency's time zone: this
// month, last month, the last three months and this financial year (April to March, as Indian accounts run).
import type { FinancePeriodInput } from "@travel-crm/contracts/finance";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";

export const financePeriods = ["thisMonth", "lastMonth", "threeMonths", "financialYear"] as const;
export type FinancePeriod = (typeof financePeriods)[number];

const day = (year: number, month: number, date: number) =>
  new Date(Date.UTC(year, month, date)).toISOString().slice(0, 10);

/** A period's first and last days, from today in the agency's zone. */
export function periodOf(period: FinancePeriod, today: string): FinancePeriodInput {
  const [year = 2026, month = 1] = today.split("-").map(Number);
  const m = month - 1;
  switch (period) {
    case "thisMonth":
      return { from: day(year, m, 1), to: today };
    case "lastMonth":
      return { from: day(year, m - 1, 1), to: day(year, m, 0) };
    case "threeMonths":
      return { from: day(year, m - 2, 1), to: today };
    case "financialYear":
      return { from: day(m >= 3 ? year : year - 1, 3, 1), to: today };
  }
}

export function useToday() {
  return calendarDateIn(new Date(), useMe().organization.timeZone);
}

export function useFinanceSummary(period: FinancePeriodInput) {
  const trpc = useTRPC();
  return useQuery(trpc.finance.summary.queryOptions(period, { placeholderData: (shown) => shown }));
}

export function useBookings() {
  const trpc = useTRPC();
  return useQuery(trpc.finance.bookings.queryOptions());
}

export function useExpenses(period: FinancePeriodInput) {
  const trpc = useTRPC();
  return useQuery(trpc.finance.expenses.queryOptions(period, { placeholderData: (shown) => shown }));
}

export function useBookingCosts(quoteId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.finance.costs.queryOptions({ quoteId }));
}

/** After any money change: everything finance shows. */
export function useFinanceChanges() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = { onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.finance.pathKey() }) };
  return {
    addCost: useMutation(trpc.finance.addCost.mutationOptions(options)),
    markCostPaid: useMutation(trpc.finance.markCostPaid.mutationOptions(options)),
    voidCost: useMutation(trpc.finance.voidCost.mutationOptions(options)),
    addExpense: useMutation(trpc.finance.addExpense.mutationOptions(options)),
    voidExpense: useMutation(trpc.finance.voidExpense.mutationOptions(options)),
  };
}
