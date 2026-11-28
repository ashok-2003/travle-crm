"use client";

// The filters a table's Filters applied, as chips over its rows (bookings revamp, 2026-11-27): each says what it keeps
// ("Travel 1 Dec – 31 Dec", "Overdue"), ink as every chosen chip is (DESIGN.md, Selected Is Ink), with a ✕; pressing it
// lets that filter go. Nothing applied, nothing shows.
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toggle } from "@/components/ui/toggle";

export interface AppliedFilter {
  label: string;
  onRemove: () => void;
}

export function AppliedFilters({ chips }: { chips: readonly AppliedFilter[] }) {
  const t = useTranslations("common.table");
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label={t("appliedFilters")} className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Toggle
          key={chip.label}
          variant="outline"
          pressed
          aria-label={t("removeFilter", { filter: chip.label })}
          onPressedChange={chip.onRemove}
        >
          {chip.label}
          <XIcon aria-hidden="true" />
        </Toggle>
      ))}
    </div>
  );
}
