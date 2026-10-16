"use client";

// Plans on tablets and wider (DESIGN.md section 6): a table, prices and limits mono and right-aligned, an extra seat's
// price under its cycle's. Everything stays on one line but the modules, which wrap. Super admins get each plan's actions.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanActions } from "./plan-actions";
import { PlanStatusBadge, usePlanFigures } from "./plan-figures";

function Price({ price, sold, extraSeat }: { price: string; sold: boolean; extraSeat: string | null }) {
  const t = useTranslations("consolePlatform.plans");
  return (
    <span className="flex flex-col items-end whitespace-nowrap">
      <span className={sold ? "numbers" : "text-muted-foreground"}>{price}</span>
      {extraSeat !== null && (
        <span className="text-caption text-muted-foreground">
          {t("extraSeat")} <span className="numbers">{extraSeat}</span>
        </span>
      )}
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
          <TableHead scope="col" className="text-right">
            {t("columns.monthly")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.yearly")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.seats")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.whatsappNumbers")}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.storage")}
          </TableHead>
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
          return (
            <TableRow key={plan.id} className="whitespace-nowrap">
              <TableCell>
                <span className="flex flex-col py-1">
                  <span className="font-medium script-leading">{plan.name}</span>
                  <span className="numbers text-caption text-muted-foreground">{plan.key}</span>
                </span>
              </TableCell>
              <TableCell>
                <PlanStatusBadge plan={plan} />
              </TableCell>
              <TableCell className="text-right">
                <Price
                  price={figures.monthly}
                  sold={plan.monthlyPricePaise !== null}
                  extraSeat={figures.extraSeatMonthly}
                />
              </TableCell>
              <TableCell className="text-right">
                <Price
                  price={figures.yearly}
                  sold={plan.yearlyPricePaise !== null}
                  extraSeat={figures.extraSeatYearly}
                />
              </TableCell>
              <TableCell className="numbers text-right">{figures.seats}</TableCell>
              <TableCell className="numbers text-right">{figures.whatsappNumbers}</TableCell>
              <TableCell className="numbers text-right">{figures.storage}</TableCell>
              <TableCell className="whitespace-normal">{figures.modules}</TableCell>
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
