// Grounding the departure changes: days added (listed, or every week between two dates), and one departure cancelled,
// reopened, priced on its own or given other seats. Each departure is named by its D ref and must have its day printed in
// a cited line; a past day, a cancelled day and seats already sold are flagged.
import { MAX_SEATS } from "@travel-crm/contracts/departures";
import type { AnsweredChange } from "./answer.js";
import { addDays, type CalendarDate } from "../../kernel/index.js";
import { dateInTexts, dayInTexts, dayOf, printedDate, startLooksBack, weekdaysIn } from "./dates.js";
import {
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

type Of<Kind extends AnsweredChange["kind"]> = Extract<AnsweredChange, { kind: Kind }>;

/** The days a weekly rule gives from tomorrow on, or null when its dates or days can't be read. */
function weeklyDays(weekly: NonNullable<Of<"departures_add">["weekly"]>, grounding: Grounding, flags: Set<ChangeFlag>) {
  const from = printedDate(weekly.from);
  const to = printedDate(weekly.to);
  const days = new Set(weekly.days.flatMap((day) => [...weekdaysIn(day)]));
  const start = from === null ? null : dayOf(from, startLooksBack(grounding.today));
  const end = start === null || to === null ? null : dayOf(to, start);
  if (from === null || to === null || start === null || end === null || days.size === 0) return null;
  const named = new Set(grounding.texts.flatMap((text) => [...weekdaysIn(text)]));
  if (
    !dateInTexts(from, grounding.texts) ||
    !dateInTexts(to, grounding.texts) ||
    [...days].some((day) => !named.has(day))
  ) {
    flags.add("not_in_message");
  }
  const found: string[] = [];
  for (
    let day = later(start, addDays(grounding.today, 1));
    day <= end && found.length < MOST_DATES;
    day = addDays(day, 1)
  ) {
    if (days.has(weekdayOf(day))) found.push(day);
  }
  return found;
}

function departuresAdd(change: Of<"departures_add">, grounding: Grounding): Built | null {
  const flags = new Set<ChangeFlag>();
  const dates = new Set<string>();
  for (const printed of change.dates) {
    const date = printedDate(printed);
    const day = date === null ? null : dayOf(date, startLooksBack(grounding.today));
    if (date === null || day === null) {
      flags.add("not_in_message");
      continue;
    }
    if (!dateInTexts(date, grounding.texts)) flags.add("not_in_message");
    dates.add(day);
  }
  if (change.weekly !== null) {
    const weekly = weeklyDays(change.weekly, grounding, flags);
    if (weekly === null) flags.add("not_in_message");
    for (const day of weekly ?? []) dates.add(day);
  }
  // A day that already departs needs nothing; a day holding a cancelled departure is offered, flagged (reopen it instead).
  const byDay = new Map(grounding.snapshot.departures.map((one) => [one.startDate, one]));
  const kept = [...dates]
    .sort()
    .filter((day) => {
      const there = byDay.get(day);
      if (there?.status === "cancelled") flags.add("cancelled_date");
      return there === undefined || there.status === "cancelled";
    })
    .slice(0, MOST_DATES);
  if (kept.length === 0) return null;
  if (kept.some((day) => day <= grounding.today)) flags.add("past_date");
  return { body: { kind: "departures_add", dates: kept }, flags: [...flags] };
}

type OneDeparture = Of<"departure_cancel" | "departure_reopen" | "departure_prices" | "departure_seats">;

/** One departure's change: the departure its ref names, with its day checked against the cited lines. */
function oneDeparture(change: OneDeparture, grounding: Grounding): Built | null {
  const one = grounding.snapshot.departures.find((departure) => departure.ref === change.departure);
  if (one === undefined) return null;
  const flags: ChangeFlag[] = dayInTexts(one.startDate, grounding.texts) ? [] : ["not_in_message"];
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
      const { prices, grounded } = pricesFrom(
        change.prices,
        one.prices,
        grounding.snapshot.trip.roomTypes,
        grounding.texts,
      );
      if (!hasPrice(prices) || samePrices(prices, one.ownPrices)) return null;
      if (!grounded) flags.push("not_in_message");
      if (one.status === "cancelled") flags.push("cancelled_date");
      return { body: { kind: change.kind, ...at, before: one.ownPrices, prices }, flags };
    }
    case "departure_seats": {
      const seats = typeof change.seats === "number" ? change.seats : Number(change.seats.replace(/\D/g, "") || "x");
      if (!Number.isInteger(seats) || seats < 0 || seats > MAX_SEATS || seats === one.seatsTotal) return null;
      if (!numberInTexts(seats, grounding.texts)) flags.push("not_in_message");
      if (seats < one.seatsSold + one.seatsHeld) flags.push("has_bookings");
      if (one.status === "cancelled") flags.push("cancelled_date");
      return { body: { kind: change.kind, ...at, before: one.seatsTotal, seatsTotal: seats }, flags };
    }
  }
}

export function groundDeparture(change: Of<"departures_add"> | OneDeparture, grounding: Grounding): Built | null {
  return change.kind === "departures_add" ? departuresAdd(change, grounding) : oneDeparture(change, grounding);
}
