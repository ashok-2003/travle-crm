"use client";

// An organization's time zone from the console's list, each named in words; a zone set some other way is still
// offered, as itself, so a correction never changes it unasked.
import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { SelectField, type SelectOption } from "@/components/forms/select-field";
import { isListedTimeZone, timeZones } from "./time-zones";

export function TimeZoneField<Values extends FieldValues>({
  control,
  name,
  label,
  current,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  /** The organization's zone today, offered even when the list doesn't hold it. */
  current?: string;
}) {
  const t = useTranslations("consoleOrganizations.timeZones");
  const options: SelectOption[] = timeZones.map((zone) => ({ value: zone, label: t(zone) }));
  if (current !== undefined && !isListedTimeZone(current)) options.push({ value: current, label: current });
  return <SelectField control={control} name={name} label={label} options={options} />;
}
