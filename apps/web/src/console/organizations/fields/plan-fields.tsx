"use client";

// Choosing a plan on sale and a billing cycle it is sold on, for onboarding and for a change of plan: each plan by
// its name, then the cycles of the plan chosen, each with its price before GST (said once, there).
import type { BillingCycle, PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { ChoiceField } from "./choice-field";
import { cyclesOf, priceOf, rupees } from "./plan-prices";
import { SelectField } from "@/components/forms/select-field";

/** The cycle to keep when the plan changes: the one chosen if the new plan is sold that way, else its first. */
export function cycleFor(plan: PlanSummary, current: string): BillingCycle | "" {
  const cycles = cyclesOf(plan);
  return cycles.find((cycle) => cycle === current) ?? cycles[0] ?? "";
}

export function PlanFields<Values extends FieldValues>({
  control,
  planField,
  cycleField,
  plans,
  chosenPlanId,
  onPlanChosen,
}: {
  control: Control<Values>;
  planField: FieldPath<Values>;
  cycleField: FieldPath<Values>;
  /** The plans on sale. */
  plans: PlanSummary[];
  chosenPlanId: string;
  onPlanChosen: (plan: PlanSummary) => void;
}) {
  const t = useTranslations("consoleOrganizations.onboard.subscription");
  const chosen = plans.find((plan) => plan.id === chosenPlanId);
  return (
    <>
      <SelectField
        control={control}
        name={planField}
        label={t("plan")}
        placeholder={t("planPlaceholder")}
        options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        onChosen={(value) => {
          const plan = plans.find((candidate) => candidate.id === value);
          if (plan) onPlanChosen(plan);
        }}
      />
      {chosen && (
        <ChoiceField
          control={control}
          name={cycleField}
          legend={t("cycle")}
          options={cyclesOf(chosen).map((cycle) => ({
            value: cycle,
            label: t(`cycles.${cycle}`, { price: rupees(priceOf(chosen, cycle) ?? 0) }),
          }))}
        />
      )}
    </>
  );
}
