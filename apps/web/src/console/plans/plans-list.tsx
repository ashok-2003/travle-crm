"use client";

// Plans on phones (DESIGN.md section 6): a divided list, each plan's name and state first, then its prices, limits
// and modules. Super admins get each plan's actions beside its name.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { PlanActions } from "./plan-actions";
import { PlanStatusBadge, usePlanFigures } from "./plan-figures";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{label}</span> <span className="numbers">{value}</span>
    </span>
  );
}

export function PlansList({ plans, editable }: { plans: PlanSummary[]; editable: boolean }) {
  const t = useTranslations("consolePlatform.plans");
  const figuresOf = usePlanFigures();
  return (
    <ul className="divide-y rounded-lg border">
      {plans.map((plan) => {
        const figures = figuresOf(plan);
        return (
          <li key={plan.id} className="flex items-start gap-2 px-4 py-3">
            <div className="flex flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words script-leading">{plan.name}</span>
                <PlanStatusBadge plan={plan} />
              </span>
              <span className="numbers text-caption text-muted-foreground">{plan.key}</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                <Figure label={t("columns.monthly")} value={figures.monthly} />
                <Figure label={t("columns.yearly")} value={figures.yearly} />
                {figures.extraSeatMonthly !== null && (
                  <Figure label={t("extraSeatMonthly")} value={figures.extraSeatMonthly} />
                )}
                {figures.extraSeatYearly !== null && (
                  <Figure label={t("extraSeatYearly")} value={figures.extraSeatYearly} />
                )}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                <Figure label={t("columns.seats")} value={figures.seats} />
                <Figure label={t("columns.whatsappNumbers")} value={figures.whatsappNumbers} />
                <Figure label={t("columns.storage")} value={figures.storage} />
              </span>
              <span className="text-label">{figures.modules}</span>
            </div>
            {editable && <PlanActions plan={plan} />}
          </li>
        );
      })}
    </ul>
  );
}
