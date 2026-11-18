"use client";

// Home's period filter (spec 5): Today, This week, This month or All time, the registry ToggleGroup as chips. One is
// always chosen, so pressing the chosen chip again keeps it.
import { periods, type Period } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function isPeriod(value: string): value is Period {
  return (periods as readonly string[]).includes(value);
}

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  const t = useTranslations("home.period");
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={t("label")}
      value={value}
      onValueChange={(chosen) => {
        if (isPeriod(chosen)) onChange(chosen);
      }}
    >
      {periods.map((period) => (
        <ToggleGroupItem key={period} value={period}>
          {t(period)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
