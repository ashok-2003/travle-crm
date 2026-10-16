"use client";

// Onboarding's subscription: a plan on sale with its prices, a billing cycle the plan is sold on (the first one it is
// priced for, until changed), and how it starts: the policy's usual trial, a trial to a chosen day, or active and
// paid through a day. Prices are before GST, in Indian formats.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { ChoiceField } from "../fields/choice-field";
import { cycleFor, PlanFields } from "../fields/plan-fields";
import type { OnboardValues } from "./onboard-values";

export function SubscriptionFields({
  form,
  plans,
  trialDays,
}: {
  form: UseFormReturn<OnboardValues>;
  /** The plans on sale. */
  plans: PlanSummary[];
  /** The policy's trial length, once it has loaded. */
  trialDays: number | null;
}) {
  const t = useTranslations("consoleOrganizations.onboard.subscription");
  const [planId, start] = useWatch({ control: form.control, name: ["planId", "start"] });

  return (
    <>
      <PlanFields
        control={form.control}
        planField="planId"
        cycleField="billingCycle"
        plans={plans}
        chosenPlanId={planId}
        onPlanChosen={(plan) => {
          form.setValue("billingCycle", cycleFor(plan, form.getValues("billingCycle")));
        }}
      />
      <ChoiceField
        control={form.control}
        name="start"
        legend={t("start")}
        options={[
          {
            value: "trial",
            label: t("starts.trial"),
            description: trialDays === null ? undefined : t("trialLength", { count: trialDays }),
          },
          { value: "trial-until", label: t("starts.trial-until") },
          { value: "paid", label: t("starts.paid") },
        ]}
      />
      {start === "trial-until" && <DateField control={form.control} name="trialEndsOn" label={t("trialEndsOn")} />}
      {start === "paid" && <DateField control={form.control} name="paidThrough" label={t("paidThrough")} />}
    </>
  );
}
