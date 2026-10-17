"use client";

// When they travel (spec 3.2, R47): not asked yet, exact dates (two DateFields), a month from the next 18, or open
// dates. A month the lead already holds stays on the list even once it has passed, so editing never loses it.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { SelectField } from "@/components/forms/select-field";
import { useMe } from "@/session/me-context";
import type { LeadFormValues } from "./lead-form-values";

const MONTHS_AHEAD = 18;
const whenKinds = ["unknown", "dates", "month", "flexible"] as const;

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-12" as "December 2026". */
const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T00:00:00Z`));

/** This month and the 17 after it, as "yyyy-mm", in the agency's calendar. */
function nextMonths(timeZone: string): string[] {
  const [year = 0, month = 1] = calendarDateIn(new Date(), timeZone).split("-").map(Number);
  return Array.from({ length: MONTHS_AHEAD }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

export function WhenField({ form, disabled }: { form: UseFormReturn<LeadFormValues>; disabled: boolean }) {
  const t = useTranslations("leads.form.trip");
  const { timeZone } = useMe().organization;
  const { control } = form;
  const [kind, held] = form.watch(["whenKind", "month"]);
  const months = nextMonths(timeZone);
  if (held !== "" && !months.includes(held)) months.unshift(held);
  return (
    <>
      <SelectField
        control={control}
        name="whenKind"
        label={t("when")}
        disabled={disabled}
        options={whenKinds.map((value) => ({ value, label: t(`whenKinds.${value}`) }))}
      />
      {kind === "dates" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField control={control} name="from" label={t("from")} />
          <DateField control={control} name="to" label={t("to")} />
        </div>
      )}
      {kind === "month" && (
        <SelectField
          control={control}
          name="month"
          label={t("month")}
          placeholder={t("chooseMonth")}
          disabled={disabled}
          options={months.map((month) => ({ value: month, label: monthLabel(month) }))}
        />
      )}
    </>
  );
}
