"use client";

// What a tapped day of a trip's departures calendar holds and the changes it offers, by what the day is: a departure
// ahead (its season, each room's price, its seats; change seats, a price for it alone, cancel, open), a cancelled one
// (reopen), an empty day ahead (add a departure, once or every week) or a day that has passed (read only: the api
// refuses changes to today and before). Each change shows only to whoever holds its permission.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { dayWithWeekday, type Day } from "./departure-calendar-days";
import { AddDeparture } from "./add-departure";
import { DepartureDay, DepartureFacts } from "./departure-day";

export function DayPanel({
  detail,
  day,
  departure,
  today,
}: {
  detail: PackageDetail;
  day: Day;
  /** The departure that starts on this day, if any. */
  departure: CalendarDeparture | null;
  today: Day;
}) {
  const t = useTranslations("packages.departuresCalendar");
  const ahead = day > today;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-section font-semibold">{dayWithWeekday(day)}</h3>
      {!ahead ? (
        <>
          {departure === null ? (
            <p className="text-muted-foreground">{t("pastNone")}</p>
          ) : (
            <DepartureFacts detail={detail} departure={departure} />
          )}
          <p className="text-muted-foreground">{t("pastDay")}</p>
        </>
      ) : departure === null ? (
        <AddDeparture detail={detail} day={day} />
      ) : (
        <DepartureDay detail={detail} departure={departure} />
      )}
    </div>
  );
}
