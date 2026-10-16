"use client";

// A lead's stage as a badge (R43): grey while open and for Not a lead, green for Won, red for Lost, always a dot and
// the stage's word. The colour that asks for attention is on the next step, not the stage.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const toneOf = (stage: LeadStage): StatusTone => (stage === "won" ? "good" : stage === "lost" ? "bad" : "neutral");

export function StageBadge({ stage }: { stage: LeadStage }) {
  const t = useTranslations("leads.stages");
  return <StatusBadge tone={toneOf(stage)}>{t(stage)}</StatusBadge>;
}
