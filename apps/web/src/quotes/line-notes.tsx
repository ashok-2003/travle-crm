"use client";

// What a quote line says about where its price came from (release 7b): "Needs a rate" for a package line with no rate for these
// dates (until a price is typed), and, for whoever may see margins, the cost a rate gave it.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { useWatch, type Control } from "react-hook-form";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { useHolds } from "@/session/me-context";
import type { QuoteFormValues } from "./quote-form-values";

export function LineNotes({ control, index }: { control: Control<QuoteFormValues>; index: number }) {
  const t = useTranslations("quotes.rates");
  const seesMargin = useHolds("money:view_margin");
  const line = useWatch({ control, name: `items.${String(index)}` as `items.${number}` });
  const priced = (paiseFromRupeesText(line.price) ?? 0) > 0;
  const needsRate = line.needsRate === true && !priced;
  const cost = seesMargin ? line.costUnitPaise : undefined;
  if (!needsRate && cost === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
      {needsRate && <StatusBadge tone="attention">{t("needsRate")}</StatusBadge>}
      {cost !== undefined && (
        <span className="numbers text-caption text-muted-foreground">{t("costEach", { amount: rupees(cost) })}</span>
      )}
    </div>
  );
}
