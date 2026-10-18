"use client";

// The list's quick filters (R42): the registry ToggleGroup as filter chips, Open (a salesperson's reads "Mine · open")
// and each open stage, each with its count; a stage's chip carries its stage's dot (DESIGN.md "Stage Colours"); the
// chosen one is in the action tint with a check in the dot's place. Won, Lost and Not a lead are under Filters' Stage,
// when no chip is chosen.
import { openLeadStages, type LeadCounts } from "@travel-crm/contracts/crm";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCount } from "@/lib/format";
import { StageDot } from "../stage-badge";

const chips = ["open", ...openLeadStages] as const;
export type ChipStage = (typeof chips)[number];

export function isChipStage(stage: string): stage is ChipStage {
  return (chips as readonly string[]).includes(stage);
}

export function StageChips({
  stage,
  counts,
  ownOnly,
  onChoose,
}: {
  /** The list's stage: a chip's, or a closed one chosen in Filters. */
  stage: string;
  counts: LeadCounts | undefined;
  /** A salesperson, who sees only their own leads. */
  ownOnly: boolean;
  onChoose: (stage: ChipStage) => void;
}) {
  const t = useTranslations("leads");
  const words = (chip: ChipStage) => {
    if (chip !== "open") return t(`stages.${chip}`);
    return ownOnly ? t("list.mineOpen") : t("list.open");
  };
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={t("list.chips")}
      value={isChipStage(stage) ? stage : ""}
      onValueChange={(chosen) => {
        // Pressing the chosen chip again keeps it: one is always shown, or a stage from Filters.
        if (isChipStage(chosen)) onChoose(chosen);
      }}
    >
      {chips.map((chip) => (
        <ToggleGroupItem key={chip} value={chip}>
          {chip === stage ? <CheckIcon aria-hidden="true" /> : chip !== "open" && <StageDot stage={chip} />}
          {words(chip)}
          {counts && (
            // Muted beside an unchosen chip's word; on the chosen chip's tint, its dark ink (DESIGN.md section 2).
            <span className="numbers font-normal text-muted-foreground group-data-[state=on]/toggle:text-current">
              {formatCount(counts[chip])}
            </span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
