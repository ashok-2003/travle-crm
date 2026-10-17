"use client";

// A trip in one line, for the list, Today and the known contact (spec 3.3): "Kashmir · Dec · 2 adults, 1 child". A
// month reads "Dec" this year and "Jan 2027" another; dates read "14 – 20 Nov" (useTravelDates alone, for the lead
// page's trip); flexible dates read "dates open". Travel dates are days with no time, so they are written as they are;
// only "this year" is the agency's.
import type { TravelWhen, TripSummary } from "@travel-crm/contracts/crm";
import { yearIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useMe } from "@/session/me-context";

/** A day with no time read as UTC midnight, so formatting never moves it. */
const dayOf = (text: string) => new Date(`${text}T00:00:00Z`);

const formatters = {
  day: new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "UTC" }),
  dayMonth: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
  dayMonthYear: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  month: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }),
  monthYear: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
};

type TripWords = ReturnType<typeof useTranslations<"leads.trip">>;

type TravelDates = Extract<TravelWhen, { kind: "dates" }>;

/** "14 – 20 Nov", "28 Nov – 3 Dec", "28 Dec 2026 – 3 Jan 2027", or "14 Nov" for one day. */
function datesOf(dates: Pick<TravelDates, "from" | "to">, thisYear: number, t: TripWords): string {
  const [from, to] = [dayOf(dates.from), dayOf(dates.to)];
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const end = (to.getUTCFullYear() === thisYear ? formatters.dayMonth : formatters.dayMonthYear).format(to);
  if (dates.from === dates.to) return end;
  if (!sameYear) return t("range", { from: formatters.dayMonthYear.format(from), to: end });
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  return t("range", { from: (sameMonth ? formatters.day : formatters.dayMonth).format(from), to: end });
}

/** "Dec", "Jan 2027", the dates (datesOf), "dates open", or nothing. */
function whenOf(when: TravelWhen, thisYear: number, t: TripWords): string | null {
  switch (when.kind) {
    case "unknown":
      return null;
    case "flexible":
      return t("datesOpen");
    case "month": {
      const month = dayOf(`${when.month}-01`);
      return (month.getUTCFullYear() === thisYear ? formatters.month : formatters.monthYear).format(month);
    }
    case "dates":
      return datesOf(when, thisYear, t);
  }
}

/** "2 adults, 1 child", "6 adults", "2 children", or nothing. */
function travellersOf(trip: TripSummary, t: TripWords): string | null {
  const adults = trip.adults === null ? null : t("adults", { count: trip.adults });
  const children = trip.childrenCount === 0 ? null : t("children", { count: trip.childrenCount });
  if (adults && children) return t("travellers", { adults, children });
  return adults ?? children;
}

export function useTripLine(): (trip: TripSummary) => string {
  const t = useTranslations("leads.trip");
  const { timeZone } = useMe().organization;
  return useCallback(
    (trip: TripSummary) => {
      const thisYear = yearIn(new Date(), timeZone);
      const parts = [trip.destinationName, whenOf(trip.when, thisYear, t), travellersOf(trip, t)].filter(
        (part): part is string => part !== null && part !== "",
      );
      return parts.length > 0 ? parts.join(" · ") : t("none");
    },
    [t, timeZone],
  );
}

/** Exact travel dates as the line writes them ("14 – 20 Nov"), for a screen that words the rest its own way. */
export function useTravelDates(): (dates: Pick<TravelDates, "from" | "to">) => string {
  const t = useTranslations("leads.trip");
  const { timeZone } = useMe().organization;
  return useCallback((dates) => datesOf(dates, yearIn(new Date(), timeZone), t), [t, timeZone]);
}
