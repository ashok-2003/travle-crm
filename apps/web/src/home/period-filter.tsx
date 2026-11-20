"use client";

// Home's period filter (spec 5): Today, This week, This month or All time. From tablets up, the registry ToggleGroup as
// chips; one is always chosen, so pressing the chosen chip again keeps it. On a phone, where the four chips took two
// rows, the registry Select instead (owner, 2026-11-19).
import { periods, type Period } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWideScreen } from "@/lib/use-wide-screen";

export function isPeriod(value: string): value is Period {
  return (periods as readonly string[]).includes(value);
}

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  const t = useTranslations("home.period");
  const wide = useWideScreen();
  const choose = (chosen: string) => {
    if (isPeriod(chosen)) onChange(chosen);
  };
  if (!wide) {
    return (
      <Select value={value} onValueChange={choose}>
        <SelectTrigger aria-label={t("label")} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem key={period} value={period}>
              {t(period)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <ToggleGroup type="single" variant="outline" aria-label={t("label")} value={value} onValueChange={choose}>
      {periods.map((period) => (
        <ToggleGroupItem key={period} value={period}>
          {t(period)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
