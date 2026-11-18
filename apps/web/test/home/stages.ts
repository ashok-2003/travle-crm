// A stage breakdown as the api sends it, and the helpers Home's tests share.
import type { AppRouter } from "@travel-crm/api";
import type { StageBreakdown } from "@travel-crm/contracts/crm";
import type { TodayItem } from "@travel-crm/contracts/today";
import type { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { vi } from "vitest";
import { createApiClient } from "@/data/trpc";

export const breakdown: StageBreakdown = {
  total: 20,
  stages: { new: 7, contacted: 5, quote_sent: 3, booking_requested: 2, won: 2, lost: 1, not_a_lead: 4 },
};

/** The bodies of every request the app has sent, to see what was asked (the stub records only the paths). */
export function sentBodies(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(
      ([input, init]) =>
        `${String(input instanceof Request ? input.url : input)} ${typeof init?.body === "string" ? init.body : ""}`,
    );
}

/** Puts what the three My tasks sections answer in the cache: the api stub answers a procedure by its path alone. */
export function seedTasks(
  queryClient: QueryClient,
  sections: { overdue: TodayItem[]; dueToday: TodayItem[]; newLeads: TodayItem[] },
): void {
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  const named = { overdue: sections.overdue, "due-today": sections.dueToday, "new-leads": sections.newLeads } as const;
  for (const [section, items] of Object.entries(named) as [keyof typeof named, TodayItem[]][]) {
    queryClient.setQueryData(trpc.today.section.queryKey({ section, limit: 5 }), { items, nextCursor: null });
  }
}

/** Puts the departures Today shows in the cache, as useTodaySection("departures") keeps them. */
export function seedDepartures(queryClient: QueryClient, items: TodayItem[]): void {
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  queryClient.setQueryData([...trpc.today.section.pathKey(), { section: "departures" }], {
    pages: [{ items, nextCursor: null }],
    pageParams: [null],
  });
}
