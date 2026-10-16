"use client";

// A calendar day bound to a react-hook-form field, for every date a person enters (never the browser's own date
// input). It is the registry InputGroup, shaped as every input: the day typed as Indian screens write it, dd/mm/yyyy
// (or 1/2/2027, 01-02-2027), with a calendar button at its end that opens the registry Calendar in a Popover.
// Labelled, hinted and with its error as every field is (form-field.tsx):
//
//   <DateField control={form.control} name="paidOn" label={t("paidOn")} />
//
// The value is the api's yyyy-mm-dd, "" while empty, and the text as typed while it isn't a real day, so the form's
// check refuses it and names the field.
import { CalendarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Calendar } from "@/components/ui/calendar";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const INDIAN_DAY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

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

/** A typed day ("16/10/2026", "1/2/2027", "01-02-2027") as yyyy-mm-dd, or null for text that isn't a real day. */
export function parseIndianDate(text: string): string | null {
  const match = INDIAN_DAY.exec(text.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? valueOf(date) : null;
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
  const { field, fieldState } = useController({ control, name });
  const value = typeof field.value === "string" ? field.value : "";
  const day = dayOf(value);
  const [typed, setTyped] = useState(() => indianDate(value));
  const [open, setOpen] = useState(false);
  // What was typed while it stands for the value; the value itself once it was set some other way (the calendar).
  const text = parseIndianDate(typed) === value || typed.trim() === value ? typed : indianDate(value);
  const thisYear = new Date().getFullYear();
  return (
    <FormField label={label} hint={hint} error={fieldState.error?.message}>
      {(links) => (
        // The calendar is the Popover's child beside the group, not inside its addon: the addon focuses the box on a
        // click within it, which a click in the calendar (a portal, but its React child) would otherwise reach.
        <Popover open={open} onOpenChange={setOpen}>
          <InputGroup>
            <InputGroupInput
              {...links}
              ref={field.ref}
              name={field.name}
              value={text}
              placeholder={t("placeholder")}
              autoComplete="off"
              className="numbers"
              onChange={(event) => {
                setTyped(event.target.value);
                field.onChange(parseIndianDate(event.target.value) ?? event.target.value.trim());
              }}
              onBlur={() => {
                // A day typed loosely ("1/2/2027") is written out in full once the person moves on.
                if (day) setTyped(indianDate(value));
                field.onBlur();
              }}
            />
            <InputGroupAddon align="inline-end">
              <PopoverTrigger asChild>
                <InputGroupButton size="icon-sm" aria-label={t("choose", { label })}>
                  <CalendarIcon aria-hidden="true" />
                </InputGroupButton>
              </PopoverTrigger>
            </InputGroupAddon>
          </InputGroup>
          <PopoverContent align="end" className="w-auto p-0">
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
}
