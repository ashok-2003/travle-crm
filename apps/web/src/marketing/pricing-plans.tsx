"use client";

// The plans side by side, priced monthly or yearly as the visitor picks (spec 7.2: a plan is sold only the ways it is
// priced, so one without that price says how it is sold instead). Prices are before GST, in rupees with Indian
// grouping, in mono (DESIGN.md sections 3 and 9).
import { brand } from "@travel-crm/brand";
import type { PublicPlan } from "@travel-crm/contracts/subscriptions";
import { money } from "@travel-crm/domain/kernel";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCount, formatRupees } from "@/lib/format";
import { whatsAppLink } from "./contact-links";

type Cycle = "monthly" | "yearly";

const BYTES_PER_GB = 1_000_000_000;

function PlanCard({ plan, cycle }: { plan: PublicPlan; cycle: Cycle }) {
  const t = useTranslations("marketing.pricing");
  const price = cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
  const extraSeat = cycle === "monthly" ? plan.extraSeatMonthlyPricePaise : plan.extraSeatYearlyPricePaise;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {price === null ? (
          <p className="text-muted-foreground">{t(cycle === "monthly" ? "notSoldMonthly" : "notSoldYearly")}</p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-number-lg font-medium tabular-nums">{formatRupees(money(price))}</span>
            <span className="text-muted-foreground">{t(cycle === "monthly" ? "perMonth" : "perYear")}</span>
          </p>
        )}
        <ul className="flex flex-col gap-2">
          <li>{t("seats", { count: plan.seatLimit })}</li>
          {extraSeat !== null && <li>{t("extraSeat", { price: formatRupees(money(extraSeat)) })}</li>}
          <li>{t("whatsapp", { count: plan.whatsappNumberLimit })}</li>
          <li>{t("storage", { size: formatCount(Math.round(plan.storageLimitBytes / BYTES_PER_GB)) })}</li>
        </ul>
        <div className="flex flex-col gap-2">
          <h3 className="text-label font-medium text-muted-foreground">{t("includes")}</h3>
          <ul className="flex flex-col gap-2">
            {plan.modules.map((module) => (
              <li key={module} className="flex gap-2">
                <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {t(`modules.${module}`)}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <a href={whatsAppLink(brand.salesContact.phone)} target="_blank" rel="noopener noreferrer">
            {t("choose")}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PricingPlans({ plans }: { plans: readonly PublicPlan[] }) {
  const t = useTranslations("marketing.pricing");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={t("cycle")}
        value={cycle}
        onValueChange={(value) => {
          if (value === "monthly" || value === "yearly") setCycle(value);
        }}
        className="self-start"
      >
        <ToggleGroupItem value="monthly">{t("monthly")}</ToggleGroupItem>
        <ToggleGroupItem value="yearly">{t("yearly")}</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.key} plan={plan} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}
