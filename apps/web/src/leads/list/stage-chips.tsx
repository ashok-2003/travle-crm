"use client";

// The list's quick filters (R42): the registry ToggleGroup as filter chips, Open (a salesperson's reads "Mine · open")
// and each open stage, each with its count; a stage's chip carries its stage's dot (DESIGN.md "Stage Colours"); the
// chosen one is in ink with a check in the dot's place (Selected Is Ink). Won, Lost and Not a lead are under Filters'
// Stage, when no chip is chosen. In one row that scrolls on a phone, and wraps from tablets up. StageChipGroup is the
// same chips for any stages: the pipeline's on a phone.
import { openLeadStages, type LeadCounts, type LeadStage } from "@travel-crm/contracts/crm";
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
  return (
    <StageChipGroup
      chips={chips}
      chosen={stage}
      label={t("list.chips")}
      words={(chip) => {
        if (chip !== "open") return t(`stages.${chip}`);
        return ownOnly ? t("list.mineOpen") : t("list.open");
      }}
      count={(chip) => counts?.[chip]}
      onChoose={onChoose}
      className="md:flex-wrap"
    />
  );
}

export function StageChipGroup<Chip extends "open" | LeadStage>({
  chips,
  chosen,
  label,
  words,
  count,
  onChoose,
  className,
}: {
  chips: readonly Chip[];
  /** The chosen chip, or another value when none is. */
  chosen: string;
  label: string;
  words: (chip: Chip) => string;
  /** A chip's count, or undefined for none (while they load, or a stage that isn't counted). */
  count: (chip: Chip) => number | undefined;
  onChoose: (chip: Chip) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={label}
      {...(className !== undefined && { className })}
      value={chosen}
      onValueChange={(value) => {
        // Pressing the chosen chip again keeps it: one is always shown, or a stage from Filters.
        const chip = chips.find((each) => each === value);
        if (chip !== undefined) onChoose(chip);
      }}
    >
      {chips.map((chip) => {
        const counted = count(chip);
        return (
          <ToggleGroupItem key={chip} value={chip}>
            {chip === chosen ? <CheckIcon aria-hidden="true" /> : chip !== "open" && <StageDot stage={chip} />}
            {words(chip)}
            {counted !== undefined && (
              // Muted beside an unchosen chip's word; on the chosen chip's ink, its canvas words (DESIGN.md section 2).
              <span className="numbers font-normal text-muted-foreground group-data-[state=on]/toggle:text-current">
                {formatCount(counted)}
              </span>
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
