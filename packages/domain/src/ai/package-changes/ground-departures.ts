// Grounding the departure changes: days added (listed, or every week between two dates), and one departure cancelled,
// reopened, priced on its own or given other seats. Each departure is named by its D ref and must have its day printed in
// a cited line; a date's year is the line's, else code's. A day to add that holds a cancelled departure becomes its
// reopening; a past day, a cancelled departure's change and seats already sold are flagged.
import { MAX_SEATS } from "@travel-crm/contracts/departures";
import { addDays, type CalendarDate } from "../../kernel/index.js";
import type { AnsweredOf } from "./answer.js";
import { dayInTexts, groundedDay, startLooksBack, weekdaysIn } from "./dates.js";
import {
  flagged,
  hasPrice,
  numberInTexts,
  pricesFrom,
  samePrices,
  type Built,
  type ChangeFlag,
  type Grounding,
} from "./ground-values.js";

/** The most departures one change adds. */
const MOST_DATES = 62;
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const later = (first: CalendarDate, second: CalendarDate) => (first > second ? first : second);

type Weekly = NonNullable<AnsweredOf<"departures_add">["weekly"]>;

/** The days a weekly rule gives from tomorrow on, or null when its dates or days can't be read. */
function weeklyDays(weekly: Weekly, grounding: Grounding, flags: Set<ChangeFlag>): string[] | null {
  const { texts, today } = grounding;
  const days = new Set(weekly.days.flatMap((day) => [...weekdaysIn(day)]));
  const start = groundedDay(weekly.from, texts, startLooksBack(today));
  const end = start === null ? null : groundedDay(weekly.to, texts, start.day);
  if (start === null || end === null || days.size === 0) return null;
  const named = new Set(texts.flatMap((text) => [...weekdaysIn(text)]));
  if (!start.inLines || !end.inLines || [...days].some((day) => !named.has(day))) flags.add("not_in_message");
  const found: string[] = [];
  for (
    let day = later(start.day, addDays(today, 1));
    day <= end.day && found.length < MOST_DATES;
    day = addDays(day, 1)
  ) {
    if (days.has(weekdayOf(day))) found.push(day);
  }
  return found;
}

/** The days to add (ones that already depart dropped), and a reopening for each day that holds a cancelled departure. */
function departuresAdd(change: AnsweredOf<"departures_add">, grounding: Grounding): Built[] {
  const { texts, today, snapshot } = grounding;
  const flags = new Set<ChangeFlag>();
  const dates = new Set<string>();
  for (const printed of change.dates) {
    const found = groundedDay(printed, texts, startLooksBack(today));
    if (found?.inLines !== true) flags.add("not_in_message");
    if (found !== null) dates.add(found.day);
  }
  if (change.weekly !== null) {
    const weekly = weeklyDays(change.weekly, grounding, flags);
    if (weekly === null) flags.add("not_in_message");
    for (const day of weekly ?? []) dates.add(day);
  }
  const byDay = new Map(snapshot.departures.map((one) => [one.startDate, one]));
  const days = [...dates].sort();
  const added = days.filter((day) => !byDay.has(day)).slice(0, MOST_DATES);
  const reopened = days.flatMap((day) => {
    const there = byDay.get(day);
    return there?.status === "cancelled" ? [there] : [];
  });
  const past = (day: string) => (day <= today ? (["past_date"] as const) : []);
  return [
    ...(added.length === 0
      ? []
      : [{ body: { kind: "departures_add" as const, dates: added }, flags: [...flags, ...past(added[0] ?? today)] }]),
    ...reopened.map((one) => ({
      body: { kind: "departure_reopen" as const, departureId: one.id, startDate: one.startDate },
      flags: [...flags, ...(one.startDate < today ? (["past_date"] as const) : [])],
    })),
  ];
}

type OneDeparture = AnsweredOf<"departure_cancel" | "departure_reopen" | "departure_prices" | "departure_seats">;

/** One departure's change: the departure its ref names, with its day checked against the cited lines. */
function oneDeparture(change: OneDeparture, grounding: Grounding): Built | null {
  const one = grounding.snapshot.departures.find((departure) => departure.ref === change.departure);
  if (one === undefined) return null;
  const { texts } = grounding;
  const flags = flagged(dayInTexts(one.startDate, texts));
  const at = { departureId: one.id, startDate: one.startDate };
  const past = one.startDate < grounding.today;
  switch (change.kind) {
    case "departure_cancel": {
      if (one.status === "cancelled") return null;
      if (one.seatsSold + one.seatsHeld > 0) flags.push("has_bookings");
      if (past) flags.push("past_date");
      const reason = change.reason.trim().slice(0, 200).trim();
      return { body: { kind: change.kind, ...at, reason: reason === "" ? "Cancelled by the agency" : reason }, flags };
    }
    case "departure_reopen":
      if (one.status !== "cancelled") return null;
      if (past) flags.push("past_date");
      return { body: { kind: change.kind, ...at }, flags };
    case "departure_prices": {
      // Over its own prices when it has some, else over what applies that day; a result that charges nothing new is no change.
      const base = hasPrice(one.ownPrices) ? one.ownPrices : one.prices;
      const { prices, grounded } = pricesFrom(change.prices, base, grounding.snapshot.trip.roomTypes, texts);
      if (!hasPrice(prices) || samePrices(prices, one.ownPrices) || samePrices(prices, one.prices)) return null;
      if (!grounded) flags.push("not_in_message");
      if (one.status === "cancelled") flags.push("cancelled_date");
      return { body: { kind: change.kind, ...at, before: one.ownPrices, prices }, flags };
    }
    case "departure_seats": {
      const seats = typeof change.seats === "number" ? change.seats : Number(change.seats.replace(/\D/g, "") || "x");
      if (!Number.isInteger(seats) || seats < 0 || seats > MAX_SEATS || seats === one.seatsTotal) return null;
      if (!numberInTexts(seats, texts)) flags.push("not_in_message");
      if (seats < one.seatsSold + one.seatsHeld) flags.push("has_bookings");
      if (one.status === "cancelled") flags.push("cancelled_date");
      return { body: { kind: change.kind, ...at, before: one.seatsTotal, seatsTotal: seats }, flags };
    }
  }
}

export function groundDeparture(change: AnsweredOf<"departures_add"> | OneDeparture, grounding: Grounding): Built[] {
  if (change.kind === "departures_add") return departuresAdd(change, grounding);
  const built = oneDeparture(change, grounding);
  return built === null ? [] : [built];
}
