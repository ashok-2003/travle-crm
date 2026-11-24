"use client";

// A trip's price calendar: the registry Calendar with each departure's seats left on its day, cancelled and full days
// marked, each price period (season) tinted and listed beneath with its room prices. Tapping a day shows what it offers
// (calendar-day-actions.tsx); "Set special prices from here", for whoever may change the trip (quotes:edit), makes the
// next day tapped the end of a range. Without a permission the calendar is there to read.
import type { DepartureSummary } from "@travel-crm/contracts/departures";
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, type ComponentProps } from "react";
import type { DayButton } from "react-day-picker";
import { enIN } from "react-day-picker/locale";
import { rupees } from "@/components/forms/money-field";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatCalendarDay } from "@/lib/format";
import { shownRoomTypes } from "@/room-prices/room-prices";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { CalendarDayActions } from "./calendar-day-actions";
import { dayKeyOf, departuresByDay, type CalendarDate } from "./price-calendar-days";

/** One of two tints per season, repeating (the neutral fill leaves the muted day numbers under 4.5:1): the legend's swatch wears the same class as its days. */
const seasonTints = ["bg-status-good-fill", "bg-status-attention-fill"] as const;
const tintOf = (index: number) => seasonTints[index % seasonTints.length] ?? seasonTints[0];

const dateOf = (key: CalendarDate) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8)));

export function PriceCalendar({
  detail,
  departures,
  onSelectRange,
}: {
  detail: PackageDetail;
  departures: DepartureSummary[];
  onSelectRange: (range: { from: CalendarDate; to: CalendarDate }) => void;
}) {
  const t = useTranslations("packages.calendar");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const days = useMemo(() => departuresByDay(departures), [departures]);
  // The day selected: what it offers shows beneath, and the next day tapped closes a range with it.
  const [first, setFirst] = useState<CalendarDate | null>(null);
  // After "Set special prices from here": the next day tapped ends the range.
  const [ranging, setRanging] = useState(false);
  const today = dayKeyOf(new Date());
  const mayPrice = useHolds("quotes:edit");
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;

  const onDeparture = (pick: (departure: DepartureSummary) => boolean) =>
    departures.filter(pick).map((departure) => dateOf(departure.startDate));
  const modifiers = {
    cancelled: onDeparture((departure) => departure.status === "cancelled"),
    full: onDeparture((departure) => departure.status !== "cancelled" && departure.state === "full"),
    ...Object.fromEntries(
      detail.seasons.map((season, index) => [
        `season${String(index)}`,
        { from: dateOf(season.startsOn), to: dateOf(season.endsOn) },
      ]),
    ),
  };
  const modifiersClassNames = {
    cancelled: "text-status-bad-ink",
    full: "text-status-attention-ink",
    ...Object.fromEntries(detail.seasons.map((_season, index) => [`season${String(index)}`, tintOf(index)])),
  };

  const DepartureDayButton = useMemo(
    () =>
      function DepartureDayButton(props: ComponentProps<typeof DayButton>) {
        const departure = days.get(dayKeyOf(props.day.date)) ?? null;
        return (
          <CalendarDayButton locale={enIN} {...props} className={cn(props.className, "[&>span]:opacity-100")}>
            {props.children}
            {departure?.status === "cancelled" && <XIcon aria-hidden="true" className="size-3" />}
            {departure !== null && departure.status !== "cancelled" && <span>{departure.free}</span>}
          </CalendarDayButton>
        );
      },
    [days],
  );

  const dayLabel = (date: Date) => {
    const key = dayKeyOf(date);
    const day = formatCalendarDay(key);
    const departure = days.get(key) ?? null;
    if (departure === null) return day;
    if (departure.status === "cancelled") return t("cancelledDay", { day });
    return departure.state === "full" ? t("full", { day }) : t("seatsLeft", { day, free: departure.free });
  };

  return (
    <div className="flex flex-col gap-4">
      <Calendar
        mode="range"
        selected={first === null ? undefined : { from: dateOf(first) }}
        defaultMonth={new Date()}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        components={{ DayButton: DepartureDayButton }}
        labels={{ labelDayButton: dayLabel }}
        onDayClick={(date) => {
          const tapped = dayKeyOf(date);
          if (!ranging || first === null) {
            setFirst(tapped);
            return;
          }
          setRanging(false);
          setFirst(null);
          onSelectRange(tapped < first ? { from: tapped, to: first } : { from: first, to: tapped });
        }}
      />
      {first !== null && (
        <div className="flex flex-col gap-3">
          <p className="font-medium">{formatCalendarDay(first)}</p>
          {ranging ? (
            <>
              <p className="text-muted-foreground">{t("rangePrompt")}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setRanging(false);
                }}
              >
                {t("rangeStop")}
              </Button>
            </>
          ) : (
            <>
              <CalendarDayActions
                packageId={detail.id}
                day={first}
                departure={days.get(first) ?? null}
                ahead={first > today}
              />
              {mayPrice && (
                <>
                  <Button
                    variant="outline"
                    disabled={!access.allowed}
                    aria-describedby={access.allowed ? undefined : hintId}
                    onClick={() => {
                      setRanging(true);
                    }}
                  >
                    {t("rangeStart")}
                  </Button>
                  <WriteHint id={hintId} hint={access.hint} />
                </>
              )}
              <p className="text-muted-foreground">{t("moveHint")}</p>
            </>
          )}
        </div>
      )}
      <Separator />
      {detail.seasons.length === 0 ? (
        <p className="text-muted-foreground">{t("noSeasons")}</p>
      ) : (
        <ul aria-label={t("legendTitle")} className="flex flex-col gap-3">
          {detail.seasons.map((season, index) => (
            <li key={season.id} className="flex items-start gap-3">
              <span aria-hidden="true" className={`mt-1 size-4 shrink-0 rounded-sm ${tintOf(index)}`} />
              <div>
                <p className="font-medium">{season.label}</p>
                <p className="text-caption text-muted-foreground">
                  {t("legendDates", { from: formatCalendarDay(season.startsOn), to: formatCalendarDay(season.endsOn) })}
                </p>
                <p className="numbers text-caption">
                  {shownRoomTypes(detail.roomTypes, season.prices)
                    .flatMap((room) => {
                      const price = season.prices[room];
                      return price === null ? [] : [t("legendPrice", { room: tRooms(room), price: rupees(price) })];
                    })
                    .join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
