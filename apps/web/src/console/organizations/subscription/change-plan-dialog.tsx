"use client";

// Moving an organization to another plan or billing cycle (subscriptions.changePlan): a plan on sale and a cycle it is
// sold on, starting from the current ones. The plans load when the dialog opens; failing, it says so with Try again.
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { ErrorState } from "@/components/error-state";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsoleTRPC } from "../../data/console-trpc";
import { cycleFor, PlanFields } from "../fields/plan-fields";
import { toChangePlanInput, type PlanValues } from "./change-inputs";
import { ChangeDialog, FormFooter, useAfterChange, useCheckedForm } from "./change-form";

export function ChangePlanDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.changePlan");
  return (
    <ChangeDialog label={t("action")} title={t("title")} description={t("description")}>
      {(close) => <ChangePlanForm subscription={subscription} onDone={close} />}
    </ChangeDialog>
  );
}

function ChangePlanForm({ subscription, onDone }: { subscription: SubscriptionDetails; onDone: () => void }) {
  const t = useTranslations("consoleOrganizations.subscription.changePlan");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: false }));
  const onSale = plans.data?.filter((plan) => plan.forSale && !plan.archived);
  const afterChange = useAfterChange(subscription.organizationId);
  const change = useMutation(
    trpc.subscriptions.changePlan.mutationOptions({
      onSuccess: async () => {
        await afterChange(t("done"));
        onDone();
      },
    }),
  );
  const check = (values: PlanValues) => toChangePlanInput(subscription.organizationId, values);
  const form = useCheckedForm({ planId: subscription.plan.id, billingCycle: subscription.billingCycle }, check);
  const planId = useWatch({ control: form.control, name: "planId" });
  const submit = form.handleSubmit((values) => {
    const result = check(values);
    if (result.ok) change.mutate(result.input);
  });

  if (!onSale) {
    return plans.isError ? (
      <ErrorState
        message={t("plansLoadFailed")}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void plans.refetch()}
      />
    ) : (
      <div role="status" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <PlanFields
          control={form.control}
          planField="planId"
          cycleField="billingCycle"
          plans={onSale}
          chosenPlanId={planId}
          onPlanChosen={(plan) => {
            form.setValue("billingCycle", cycleFor(plan, form.getValues("billingCycle")));
          }}
        />
      </FieldGroup>
      <FormFooter pending={change.isPending} error={change.error} label={t("submit")} pendingLabel={t("submitting")} />
    </form>
  );
}
