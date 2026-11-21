"use client";

// The list's Show (leads show spec, 2026-11-21) while it is on: the chosen filter chip at the head of the stage chips,
// ink as every chosen chip is (DESIGN.md, Selected Is Ink), with a ✕; pressing it lets the Show go, as Filters' All
// leads does. useShowWords names each Show as Filters, the chip and the export say it: "AI needs you" on Mine.
import type { LeadShow, ListLeadsInput } from "@travel-crm/contracts/crm";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Toggle } from "@/components/ui/toggle";

export function useShowWords(): (show: LeadShow, view: ListLeadsInput["view"]) => string {
  const t = useTranslations("leads.list.shows");
  return (show, view) => (show === "ai" && view === "mine" ? t("aiMine") : t(show));
}

export function ShowChip({
  show,
  view,
  onRemove,
}: {
  show: LeadShow;
  view: ListLeadsInput["view"];
  onRemove: () => void;
}) {
  const t = useTranslations("leads.list");
  const words = useShowWords()(show, view);
  return (
    // Whole in the phone's sideways strip, as each stage chip is.
    <Toggle
      variant="outline"
      pressed
      aria-label={t("showChip", { show: words })}
      onPressedChange={onRemove}
      className="shrink-0"
    >
      {words}
      <XIcon aria-hidden="true" />
    </Toggle>
  );
}
