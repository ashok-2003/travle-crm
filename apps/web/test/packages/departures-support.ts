// What the departures calendar's tests share: a group trip with two seasons, a calendar entry, and answering a call.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { waitFor } from "@testing-library/react";
import { expect } from "vitest";
import type { fakeApi, PendingCall } from "../organization/api";
import { aPackage } from "./detail";

const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

export const regular = {
  id: "0190a000-0000-7000-8000-0000000000a1",
  label: "Regular",
  startsOn: "2026-11-05",
  endsOn: "2099-12-31",
  prices: { ...none, double: 599900, single: 799900 },
};
export const diwali = {
  id: "0190a000-0000-7000-8000-0000000000a2",
  label: "Diwali",
  startsOn: "2026-11-20",
  endsOn: "2026-11-22",
  prices: { ...none, double: 899900, single: 999900 },
};
export const detail = aPackage({
  kind: "group",
  roomTypes: ["double", "single"],
  seasons: [regular, diwali],
  weeklyDays: [5],
  departureMonths: [11, 12, 1],
  seatsPerDeparture: 40,
  advancePerPersonPaise: 200000,
});

export const calendarDeparture = (startDate: string, changes: Partial<CalendarDeparture> = {}): CalendarDeparture => ({
  departureId: "0190a000-0000-7000-8000-0000000000d1",
  startDate,
  endDate: startDate,
  status: "open",
  seatsTotal: 40,
  seatsSold: 8,
  seatsHeld: 0,
  seatsFree: 32,
  prices: { ...none, double: 599900, single: 799900 },
  ownPrices: { ...none },
  priceSource: "season",
  seasonLabel: "Regular",
  ...changes,
});

const answered = new WeakSet<PendingCall>();
/** Waits for the next call to `path` that the test has not answered yet, answers it and says what it asked. */
export async function answerNext(api: ReturnType<typeof fakeApi>, path: string, data: unknown): Promise<unknown> {
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === path && !answered.has(call))).toBe(true);
  });
  const call = api.calls.find((entry) => entry.path === path && !answered.has(entry));
  if (!call) throw new Error(`no call to ${path}`);
  answered.add(call);
  call.answer(data);
  return call.input;
}
