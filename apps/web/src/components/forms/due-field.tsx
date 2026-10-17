"use client";

// A due time picked on the agency's clock (R25, R46): a day (DateField) and a time (TimeField), side by side under one
// name. The two values are the api's wallClockTime: { on: dayName's "yyyy-mm-dd", at: timeName's "HH:MM" }. A form
// starts them at suggestedDue, so the person changes a sensible time rather than filling an empty box.
import { addDays, calendarDateIn, timeOfDayIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { TimeField } from "./time-field";

const MINUTE = 60_000;
/** The working day a suggested time stays within, on the agency's clock: 9:00 (as Snooze's tomorrow morning) to 20:00. */
const DAY_STARTS = "09:00";
const DAY_ENDS = "20:00";

/**
 * The day and time a due field starts at: the next whole hour at least half an hour away on the agency's clock, or 9:00
 * when that falls outside the working day (the same morning before it starts, the next one after it ends).
 */
export function suggestedDue(timeZone: string, now = new Date()): { day: string; time: string } {
  const soonest = new Date(now.getTime() + 30 * MINUTE);
  const minutes = Number(timeOfDayIn(soonest, timeZone).slice(3, 5));
  const hour = new Date(soonest.getTime() + (minutes === 0 ? 0 : (60 - minutes) * MINUTE));
  const day = calendarDateIn(hour, timeZone);
  const time = timeOfDayIn(hour, timeZone);
  if (time < DAY_STARTS) return { day, time: DAY_STARTS };
  if (time > DAY_ENDS) return { day: addDays(day, 1), time: DAY_STARTS };
  return { day, time };
}

export function DueField<Values extends FieldValues>({
  control,
  dayName,
  timeName,
  label,
}: {
  control: Control<Values>;
  dayName: FieldPath<Values>;
  timeName: FieldPath<Values>;
  label: string;
}) {
  const t = useTranslations("forms.due");
  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <DateField control={control} name={dayName} label={t("day")} />
        <TimeField control={control} name={timeName} label={t("time")} />
      </div>
    </FieldSet>
  );
}
