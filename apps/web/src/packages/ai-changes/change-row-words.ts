"use client";

// What / Now / New for each kind of change the AI proposes, in words from the messages: the table's three columns, as
// lines (a price change has one line per room that differs, the same rooms on both sides).
import { roomTypes, type RoomPrices } from "@travel-crm/contracts/quotes";
import { tripFieldValueOf } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { formatCalendarDay } from "@/lib/format";
import type { ProposedChange } from "./use-package-changes-ai";

export interface ChangeWords {
  what: string;
  now: string[];
  next: string[];
}

type Say = ReturnType<typeof useTranslations<"packages.aiChanges">>;
type SayForm = ReturnType<typeof useTranslations<"packages.form">>;

const weekdayKeys = ["0", "1", "2", "3", "4", "5", "6"] as const;
const monthKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

export function useChangeWords(): (change: ProposedChange) => ChangeWords {
  const t = useTranslations("packages.aiChanges");
  const tForm = useTranslations("packages.form");
  return (change) => wordsOf(change, t, tForm);
}

function wordsOf(change: ProposedChange, t: Say, tForm: SayForm): ChangeWords {
  const day = (date: string) => formatCalendarDay(date);
  const room = (type: keyof RoomPrices, price: number | null) =>
    t("rows.room", { room: tForm(`roomTypeNames.${type}`), price: price === null ? t("notSold") : rupees(price) });
  // Only the rooms whose price differs, so a long table of rooms shows what moved.
  const prices = (before: RoomPrices | null, after: RoomPrices) => {
    const moved = roomTypes.filter((type) => before?.[type] !== after[type]);
    return {
      now: before === null ? [t("rows.seasonAddNow")] : moved.map((type) => room(type, before[type])),
      next: moved.map((type) => room(type, after[type])),
    };
  };
  switch (change.kind) {
    case "season_add": {
      const from = day(change.startsOn);
      const dates =
        change.endsOn === null ? t("rows.untilChanged", { from }) : t("rows.fromTo", { from, to: day(change.endsOn) });
      const added = roomTypes.filter((type) => change.prices[type] !== null);
      return {
        what: t("rows.seasonAdd", { label: change.label }),
        now: [t("rows.seasonAddNow")],
        next: [dates, ...added.map((type) => room(type, change.prices[type]))],
      };
    }
    case "season_change":
      return { what: t("rows.seasonChange", { label: change.label }), ...prices(change.before.prices, change.prices) };
    case "departures_add":
      return {
        what: t("rows.departuresAdd", { count: change.dates.length }),
        now: [t("rows.seasonAddNow")],
        next: change.dates.map(day),
      };
    case "departure_cancel":
      return {
        what: t("rows.departureCancel", { day: day(change.startDate) }),
        now: [t("rows.running")],
        next: [change.reason === "" ? t("rows.cancelled") : t("rows.cancelledWhy", { reason: change.reason })],
      };
    case "departure_reopen":
      return {
        what: t("rows.departureReopen", { day: day(change.startDate) }),
        now: [t("rows.cancelled")],
        next: [t("rows.running")],
      };
    case "departure_prices":
      return {
        what: t("rows.departurePrices", { day: day(change.startDate) }),
        ...prices(change.before, change.prices),
      };
    case "departure_seats":
      return {
        what: t("rows.departureSeats", { day: day(change.startDate) }),
        now: [change.before === null ? t("rows.usualSeats") : t("rows.seats", { count: change.before })],
        next: [t("rows.seats", { count: change.seatsTotal })],
      };
    case "trip_field": {
      const typed = tripFieldValueOf({ field: change.field, before: change.before, value: change.value });
      const show = (value: typeof typed.before): string[] => {
        if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return [t("notSet")];
        if (typeof value === "number") {
          return [typed.field === "advancePerPersonPaise" ? rupees(value) : t("rows.seats", { count: value })];
        }
        if (Array.isArray(value)) {
          return [
            value
              .map((item) =>
                typed.field === "weeklyDays"
                  ? tForm(`weekdays.${weekdayKeys[item] ?? "0"}`)
                  : tForm(`months.${monthKeys[item - 1] ?? "1"}`),
              )
              .join(", "),
          ];
        }
        return [value];
      };
      return { what: t(`fields.${typed.field}`), now: show(typed.before), next: show(typed.value) };
    }
    case "note_add":
      return { what: t("rows.noteAdd"), now: [t("notSet")], next: [change.line] };
    case "note_remove":
      return { what: t("rows.noteRemove"), now: [change.line], next: [t("rows.removed")] };
    case "itinerary":
      return {
        what: t("rows.itinerary"),
        now: [t("rows.days", { count: change.before.length })],
        next: [t("rows.days", { count: change.days.length }), ...change.days.map((entry) => entry.title)],
      };
    case "ai_selling":
      return {
        what: t("rows.aiSelling"),
        now: [change.on ? t("rows.off") : t("rows.on")],
        next: [change.on ? t("rows.on") : t("rows.off")],
      };
  }
}
