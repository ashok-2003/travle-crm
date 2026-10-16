"use client";

// Plans on phones (DESIGN.md section 6): a list of items, each plan's name and state first, then its prices, limits
// and modules. Super admins get each plan's actions beside its name.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { PlanActions } from "./plan-actions";
import { PlanStatusBadge, usePlanFigures } from "./plan-figures";

function Figure({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <span>
      <span className="text-muted-foreground">{label}</span>{" "}
      <span className={mono ? "numbers" : undefined}>{value}</span>
    </span>
  );
}

export function PlansList({ plans, editable }: { plans: PlanSummary[]; editable: boolean }) {
  const t = useTranslations("consolePlatform.plans");
  const figuresOf = usePlanFigures();
  return (
    <ItemGroup>
      {plans.map((plan, index) => {
        const figures = figuresOf(plan);
        return (
          <Fragment key={plan.id}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem" className="items-start">
              <ItemContent>
                <ItemTitle className="flex-wrap">
                  <span className="script-leading">{plan.name}</span>
                  <PlanStatusBadge plan={plan} />
                </ItemTitle>
                <ItemDescription className="numbers">{plan.key}</ItemDescription>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                  <Figure label={t("columns.monthly")} value={figures.monthly} mono={plan.monthlyPricePaise !== null} />
                  <Figure label={t("columns.yearly")} value={figures.yearly} mono={plan.yearlyPricePaise !== null} />
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
              </ItemContent>
              {editable && (
                <ItemActions>
                  <PlanActions plan={plan} />
                </ItemActions>
              )}
            </Item>
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
