"use client";

// A calendar day bound to a form field, for every date a person enters (never the browser's own date input): a button
// showing the day as Indian screens write it, dd/mm/yyyy, that opens the registry Calendar in a Popover. The value
// stays the api's yyyy-mm-dd, or empty while none is chosen. Labelled, hinted and with its error as every field is
// (form-field.tsx); the button is named by its label and the day it shows, and is 44px high. Empty, it shows the
// format the day will take, to the eye only.
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** How many years the calendar's year list reaches either side of today. */
const YEARS_AROUND = 10;

/** "2026-03-05" as Indian screens write it, "05/03/2026"; text that isn't a calendar day as it is. */
export function indianDate(value: string): string {
  const match = CALENDAR_DAY.exec(value);
  return match ? `${match[3] ?? ""}/${match[2] ?? ""}/${match[1] ?? ""}` : value;
}

/** The value's day as the calendar holds days (local midnight), or none. */
function dayOf(value: string): Date | undefined {
  const match = CALENDAR_DAY.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** The calendar's day as the value. */
function valueOf(day: Date): string {
  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${String(day.getFullYear())}-${twoDigits(day.getMonth() + 1)}-${twoDigits(day.getDate())}`;
}

export function DateField<Values extends FieldValues>({
  control,
  name,
  label,
  hint,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  hint?: string;
}) {
  const t = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value = typeof field.value === "string" ? field.value : "";
        const day = dayOf(value);
        return (
          <FormField label={label} hint={hint} error={fieldState.error?.message}>
            {(links, labelId) => (
              <Popover
                open={open}
                onOpenChange={(next) => {
                  setOpen(next);
                  if (!next) field.onBlur();
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    {...links}
                    ref={field.ref}
                    variant="outline"
                    // The label, then the day shown: "Paid on 16/10/2026".
                    aria-labelledby={day ? `${labelId} ${links.id}-day` : labelId}
                    className="w-full justify-start font-normal"
                  >
                    <CalendarIcon aria-hidden="true" />
                    {day ? (
                      <span id={`${links.id}-day`} className="numbers">
                        {indianDate(value)}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="text-muted-foreground">
                        {t("placeholder")}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    required
                    autoFocus
                    captionLayout="dropdown"
                    selected={day}
                    {...(day && { defaultMonth: day })}
                    startMonth={new Date(thisYear - YEARS_AROUND, 0)}
                    endMonth={new Date(thisYear + YEARS_AROUND, 11)}
                    onSelect={(chosen) => {
                      field.onChange(valueOf(chosen));
                      setOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </FormField>
        );
      }}
    />
  );
}
