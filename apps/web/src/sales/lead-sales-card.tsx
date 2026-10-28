"use client";

// A lead's sales signal on its page (sales execution): how hot it is and why. Nothing shows for a lead that isn't hot.
import { FlameIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { LeadCard } from "@/leads/lead/lead-card";
import { useLeadSales } from "./use-sales";

export function LeadSalesCard({ leadId }: { leadId: string }) {
  const t = useTranslations("sales.lead");
  const tHot = useTranslations("sales.hot");
  const reasons = useLeadSales(leadId).data?.heat.reasons ?? [];
  if (reasons.length === 0) return null;
  return (
    <LeadCard title={t("title")}>
      <div className="flex flex-wrap items-center gap-2">
        <FlameIcon aria-hidden="true" className="size-5 text-status-bad-ink" />
        <span className="font-semibold">{t("hot")}</span>
        {reasons.map((reason) => (
          <StatusBadge key={reason} tone="bad">
            {tHot(`reasons.${reason}`)}
          </StatusBadge>
        ))}
      </div>
    </LeadCard>
  );
}
