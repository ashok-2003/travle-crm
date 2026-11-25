"use client";

// An empty day ahead in the day panel: add a departure on it, and optionally repeat it every week until a date (cut into
// the api's pieces of at most 62 days, sent one after the other, and at most a year ahead) or with no end (the weekday
// joins the trip's weekly days, which the api turns into departures 12 weeks ahead).
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { DateField } from "@/components/date-field";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useDepartureChanges } from "@/departures/use-departures";
import { useHolds } from "@/session/me-context";
import { addDays, dayWithWeekday, repeatPieces, weekdayOf, type Day } from "./departure-calendar-days";
import { useChangeGate } from "./departure-edits";
import { WEEKDAYS } from "./group-fields";
import { usePackageChanges } from "./use-packages";

type Mode = "until" | "none";
const REAL_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function AddDeparture({ detail, day }: { detail: PackageDetail; day: Day }) {
  const t = useTranslations("packages.departuresCalendar");
  const tLong = useTranslations("packages.departuresCalendar.weekdaysLong");
  const gate = useChangeGate();
  const mayAdd = useHolds("departures:create");
  const mayEditTrip = useHolds("quotes:edit");
  const { addPackageDates } = useDepartureChanges();
  const { updatePart } = usePackageChanges();
  const [repeat, setRepeat] = useState(false);
  const [mode, setMode] = useState<Mode>("until");
  const [sending, setSending] = useState(false);
  const form = useForm<{ until: string }>({ defaultValues: { until: "" } });
  const until = useWatch({ control: form.control, name: "until" });
  const weekday = weekdayOf(day);
  const untilOk = REAL_DAY.test(until) && until > day && until <= addDays(day, 366);
  const needsEnd = repeat && mode === "until" && !untilOk;
  const idPrefix = `repeat-${day}`;

  const run = async () => {
    setSending(true);
    let added = 0;
    let cancelled = 0;
    try {
      if (repeat && mode === "until") {
        for (const piece of repeatPieces(day, until)) {
          const result = await addPackageDates.mutateAsync({ packageId: detail.id, ...piece, weekdays: [weekday] });
          added += result.added.length;
          cancelled += result.cancelled.length;
        }
      } else {
        const result = await addPackageDates.mutateAsync({ packageId: detail.id, from: day, to: day, weekdays: [] });
        added += result.added.length;
        cancelled += result.cancelled.length;
        if (repeat && !detail.weeklyDays.includes(weekday)) {
          const month = Number(day.slice(5, 7));
          await updatePart.mutateAsync({
            packageId: detail.id,
            weeklyDays: [...detail.weeklyDays, weekday].sort((a, b) => a - b),
            ...(detail.departureMonths.length > 0 && !detail.departureMonths.includes(month)
              ? { departureMonths: [...detail.departureMonths, month].sort((a, b) => a - b) }
              : {}),
          });
        }
      }
      if (added > 1) toast.success(t("addedMany", { count: added }));
      else if (added === 1) toast.success(t("added"));
      else toast.info(t(cancelled > 0 ? "cancelledThere" : "alreadyThere"));
    } catch {
      // The refusal is on the mutation: shown beneath the button. Say what went in before it, for a repeat sent in pieces.
      if (added > 0) toast.error(t("addedBeforeRefusal", { count: added }));
    } finally {
      setSending(false);
    }
  };

  if (!mayAdd) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        {detail.seatsPerDeparture === null ? t("addSeatsDefault") : t("addSeats", { seats: detail.seatsPerDeparture })}
      </p>
      <Field orientation="horizontal">
        <Switch id={`${idPrefix}-switch`} checked={repeat} disabled={sending} onCheckedChange={setRepeat} />
        <FieldLabel htmlFor={`${idPrefix}-switch`}>
          {t("repeat", { weekday: tLong(WEEKDAYS[weekday] ?? "0") })}
        </FieldLabel>
      </Field>
      {repeat && (
        <>
          <ChoiceGroup
            legend={t("repeatHow")}
            value={mode}
            onChange={(next) => {
              setMode(next === "none" ? "none" : "until");
            }}
            options={[
              { value: "until", label: t("repeatUntil") },
              ...(mayEditTrip
                ? [
                    {
                      value: "none",
                      label: t("repeatNoEnd"),
                      info: { term: t("repeatNoEnd"), meaning: t("repeatNoEndHint") },
                    },
                  ]
                : []),
            ]}
            name={idPrefix}
          />
          {mode === "until" && <DateField control={form.control} name="until" label={t("repeatEnd")} />}
          {needsEnd && until !== "" && <p className="text-caption text-muted-foreground">{t("repeatNeedsEnd")}</p>}
        </>
      )}
      <Button
        disabled={gate.disabled || sending || needsEnd}
        aria-describedby={gate.describedBy}
        onClick={() => {
          void run();
        }}
      >
        {t("addOn", { day: dayWithWeekday(day) })}
      </Button>
      <RefusalAlert error={addPackageDates.error ?? updatePart.error} />
      {gate.hint}
    </div>
  );
}
