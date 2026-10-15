"use client";

// Onboarding's subscription: a plan on sale with its prices, a billing cycle the plan is sold on (the first one it is
// priced for, until changed), and how it starts: the policy's usual trial, a trial to a chosen day, or active and
// paid through a day. Prices are before GST, in Indian formats.
import type { BillingCycle, PlanSummary } from "@travel-crm/contracts/subscriptions";
import { money } from "@travel-crm/domain/kernel";
import { useTranslations } from "next-intl";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { TextField } from "@/account/text-field";
import { formatRupees } from "@/lib/format";
import { ChoiceField } from "../fields/choice-field";
import { SelectField } from "../fields/select-field";
import type { OnboardValues } from "./onboard-values";

const cycles: readonly BillingCycle[] = ["monthly", "yearly"];

function priceOf(plan: PlanSummary, cycle: BillingCycle): number | null {
  return cycle === "monthly" ? plan.monthlyPricePaise : plan.yearlyPricePaise;
}

const rupees = (paise: number) => formatRupees(money(paise));

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
  const chosen = plans.find((plan) => plan.id === planId);

  const planLabel = (plan: PlanSummary) =>
    [
      plan.name,
      ...cycles.flatMap((cycle) => {
        const price = priceOf(plan, cycle);
        return price === null ? [] : [t(`planPrices.${cycle}`, { price: rupees(price) })];
      }),
    ].join(" · ");

  return (
    <>
      <SelectField
        control={form.control}
        name="planId"
        label={t("plan")}
        placeholder={t("planPlaceholder")}
        options={plans.map((plan) => ({ value: plan.id, label: planLabel(plan) }))}
        onChosen={(value) => {
          const plan = plans.find((candidate) => candidate.id === value);
          const current = form.getValues("billingCycle");
          if (!plan || cycles.some((cycle) => cycle === current && priceOf(plan, cycle) !== null)) return;
          form.setValue("billingCycle", cycles.find((cycle) => priceOf(plan, cycle) !== null) ?? "");
        }}
      />
      {chosen && (
        <ChoiceField
          control={form.control}
          name="billingCycle"
          legend={t("cycle")}
          options={cycles.flatMap((cycle) => {
            const price = priceOf(chosen, cycle);
            return price === null ? [] : [{ value: cycle, label: t(`cycles.${cycle}`, { price: rupees(price) }) }];
          })}
        />
      )}
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
      {start === "trial-until" && (
        <TextField control={form.control} name="trialEndsOn" label={t("trialEndsOn")} type="date" />
      )}
      {start === "paid" && <TextField control={form.control} name="paidThrough" label={t("paidThrough")} type="date" />}
    </>
  );
}
