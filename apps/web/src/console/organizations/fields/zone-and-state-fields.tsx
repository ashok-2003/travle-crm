"use client";

// The two picks the organization forms share: its time zone from the console's list (a zone set some other way is
// still offered, as itself, so a correction never changes it unasked), and its GST state from the kernel's list, each
// with its two-digit code in mono.
import { gstStates } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { SelectField, type SelectOption } from "./select-field";
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

export function GstStateField<Values extends FieldValues>({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  label: string;
  placeholder?: string;
}) {
  const options = gstStates.map((state) => ({
    value: state.code,
    label: (
      <span className="flex gap-2">
        <span className="numbers">{state.code}</span>
        <span className="script-leading">{state.name}</span>
      </span>
    ),
  }));
  return <SelectField control={control} name={name} label={label} placeholder={placeholder} options={options} />;
}
