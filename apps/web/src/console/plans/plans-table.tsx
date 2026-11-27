"use client";

// Plans on tablets and wider (DESIGN.md section 6): a table whose Price cell lists each way the plan is sold (an extra
// seat's price under its cycle's) and whose Includes cell lists its limits, so it fits the console's width without a
// sideways scroll. Super admins get each plan's actions.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanActions } from "./plan-actions";
import { PlanStatusBadge, usePlanFigures } from "./plan-figures";

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between gap-4 whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="numbers">{value}</span>
    </span>
  );
}

export function PlansTable({ plans, editable }: { plans: PlanSummary[]; editable: boolean }) {
  const t = useTranslations("consolePlatform.plans");
  const figuresOf = usePlanFigures();
  return (
    <Table>
      <TableHeader>
        <TableRow className="whitespace-nowrap">
          <TableHead scope="col">{t("columns.plan")}</TableHead>
          <TableHead scope="col">{t("columns.status")}</TableHead>
          <TableHead scope="col">{t("columns.price")}</TableHead>
          <TableHead scope="col">{t("columns.includes")}</TableHead>
          <TableHead scope="col">{t("columns.modules")}</TableHead>
          {editable && (
            <TableHead scope="col">
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plans.map((plan) => {
          const figures = figuresOf(plan);
          const prices = [
            {
              key: "monthly",
              sold: plan.monthlyPricePaise !== null,
              price: figures.monthly,
              seat: figures.extraSeatMonthly,
            },
            {
              key: "quarterly",
              sold: plan.quarterlyPricePaise !== null,
              price: figures.quarterly,
              seat: figures.extraSeatQuarterly,
            },
            {
              key: "yearly",
              sold: plan.yearlyPricePaise !== null,
              price: figures.yearly,
              seat: figures.extraSeatYearly,
            },
          ] as const;
          return (
            <TableRow key={plan.id} className="align-top">
              <TableCell>
                <span className="flex flex-col py-1">
                  <span className="font-medium script-leading">{plan.name}</span>
                  <span className="numbers text-caption text-muted-foreground">{plan.key}</span>
                </span>
              </TableCell>
              <TableCell>
                <PlanStatusBadge plan={plan} />
              </TableCell>
              <TableCell>
                <span className="flex flex-col gap-1 py-1">
                  {prices
                    .filter((price) => price.sold)
                    .map((price) => (
                      <span key={price.key} className="flex flex-col">
                        <Figure label={t(`columns.${price.key}`)} value={price.price} />
                        {price.seat !== null && <Figure label={t("extraSeat")} value={price.seat} />}
                      </span>
                    ))}
                </span>
              </TableCell>
              <TableCell>
                <span className="flex flex-col gap-1 py-1">
                  <Figure label={t("columns.seats")} value={figures.seats} />
                  <Figure label={t("columns.whatsappNumbers")} value={figures.whatsappNumbers} />
                  <Figure label={t("columns.aiCredits")} value={figures.aiCredits} />
                  <Figure label={t("columns.storage")} value={figures.storage} />
                </span>
              </TableCell>
              <TableCell>{figures.modules}</TableCell>
              {editable && (
                <TableCell className="text-right">
                  <PlanActions plan={plan} />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
