"use client";

// A trip's departures in one month, for its calendar: the api reads at most 45 days, so the grid shows the month's own days.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { monthRange, type Month } from "./departure-calendar-days";

export function useDepartureCalendar(packageId: string, month: Month) {
  const trpc = useTRPC();
  return useQuery(trpc.departures.calendar.queryOptions({ packageId, ...monthRange(month) }));
}
