// A small violet "AI" chip: marks a timeline entry or a card as the AI's work, in the people tint the AI always wears.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export function AiChip(): ReactElement {
  const t = useTranslations("ai");
  return (
    <span
      data-ai-chip
      className="me-1.5 inline-flex min-h-5 items-center gap-1 rounded-badge bg-people-tint px-1.5 align-middle text-caption font-medium text-people-tint-ink"
    >
      <SparklesIcon aria-hidden="true" className="size-3" />
      {t("chip")}
    </span>
  );
}
