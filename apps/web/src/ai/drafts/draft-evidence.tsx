"use client";

// What a drafted value stands on: the line of the agency's documents it was read from (with the document's name), "check
// this" when a figure was not printed in that line, "not found in your documents" when no line says it; and, where the
// documents disagree, a choice among the alternatives each beside its own line. The AI proposes; the owner decides.
import type { SourceRef } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { InfoHint } from "@/components/info-hint";
import { StatusBadge } from "@/components/status-badge";

/** The most lines shown under one value: the rest are the same words again. */
const SHOWN_LINES = 2;

export function EvidenceNote({ evidence, checkThis }: { evidence: readonly SourceRef[]; checkThis: boolean }) {
  const t = useTranslations("ai.drafts.evidence");
  if (evidence.length === 0) return <p className="text-caption text-muted-foreground">{t("notFound")}</p>;
  return (
    <div className="flex flex-col gap-1">
      {checkThis && (
        <p className="flex items-center gap-1">
          <StatusBadge tone="attention">{t("checkThis")}</StatusBadge>
          <InfoHint term={t("checkThis")}>{t("checkThisMeaning")}</InfoHint>
        </p>
      )}
      {evidence.slice(0, SHOWN_LINES).map((line) => (
        <p key={line.token} className="text-caption text-muted-foreground">
          {t("from", { source: line.source, excerpt: line.excerpt })}
        </p>
      ))}
    </div>
  );
}

export interface Alternative {
  /** The value as the owner reads it ("₹6,999", "Fri"). */
  shown: string;
  evidence: readonly SourceRef[];
  checkThis: boolean;
}

/** The documents disagree: each alternative with its line; nothing is chosen for the owner. */
export function AlternativesChoice({
  legend,
  alternatives,
  chosen,
  onChoose,
}: {
  legend: string;
  alternatives: readonly Alternative[];
  chosen: string;
  onChoose: (index: number) => void;
}) {
  const t = useTranslations("ai.drafts.evidence");
  return (
    <ChoiceGroup
      legend={legend}
      value={chosen}
      onChange={(value) => {
        onChoose(Number(value));
      }}
      options={alternatives.map((alternative, index) => {
        const line = alternative.evidence[0];
        const words = line === undefined ? t("notFound") : t("from", { source: line.source, excerpt: line.excerpt });
        return {
          value: String(index),
          label: alternative.checkThis ? t("optionChecked", { shown: alternative.shown }) : alternative.shown,
          description: words,
        };
      })}
    />
  );
}
