"use client";

// One plan as the console shows it: each price before GST in Indian grouping ("Not sold" for a cycle it has no price
// for), its seats, WhatsApp numbers and storage, its modules by name, and its state as a dot and a word.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { StatusBadge } from "@/components/status-badge";
import { formatFileSize } from "@/files/file-size";
import { formatCount } from "@/lib/format";
import { rupees } from "@/components/forms/money-field";

export interface PlanFigures {
  monthly: string;
  yearly: string;
  /** Null when the plan sells no extra seats on that cycle. */
  extraSeatMonthly: string | null;
  extraSeatYearly: string | null;
  seats: string;
  whatsappNumbers: string;
  storage: string;
  modules: string;
}

const priceOf = (paise: number | null) => (paise === null ? null : rupees(paise));

export function usePlanFigures(): (plan: PlanSummary) => PlanFigures {
  const t = useTranslations("consolePlatform");
  return useCallback(
    (plan: PlanSummary) => ({
      monthly: priceOf(plan.monthlyPricePaise) ?? t("plans.notSold"),
      yearly: priceOf(plan.yearlyPricePaise) ?? t("plans.notSold"),
      extraSeatMonthly: priceOf(plan.extraSeatMonthlyPricePaise),
      extraSeatYearly: priceOf(plan.extraSeatYearlyPricePaise),
      seats: formatCount(plan.seatLimit),
      whatsappNumbers: formatCount(plan.whatsappNumberLimit),
      storage: formatFileSize(plan.storageLimitBytes),
      modules:
        plan.modules.length === 0
          ? t("plans.coreOnly")
          : plan.modules.map((module) => t(`modules.${module}`)).join(", "),
    }),
    [t],
  );
}

/** On sale, archived, or not for sale (the demo's own plan): DESIGN.md's neutral for the last two. */
export function PlanStatusBadge({ plan }: { plan: Pick<PlanSummary, "archived" | "forSale"> }) {
  const t = useTranslations("consolePlatform.plans");
  if (plan.archived) return <StatusBadge tone="neutral">{t("archived")}</StatusBadge>;
  if (!plan.forSale) return <StatusBadge tone="neutral">{t("notForSale")}</StatusBadge>;
  return <StatusBadge tone="good">{t("onSale")}</StatusBadge>;
}
