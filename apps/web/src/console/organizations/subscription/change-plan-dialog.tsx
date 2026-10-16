"use client";

// Moving an organization to another plan or billing cycle (subscriptions.changePlan): a plan on sale and a cycle it is
// sold on, starting from the current ones while the current plan is on sale, and from nothing chosen once it isn't.
// The plans load when the dialog opens; failing, it says so with Try again.
import type { ChangePlanInput, PlanSummary, SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { ErrorState } from "@/components/error-state";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsoleTRPC } from "../../data/console-trpc";
import { ChangeDialog, FormFooter, useChangeDialog, type Sending } from "../change-dialog";
import { useCheckedForm } from "../fields/checked-form";
import { cycleFor, PlanFields } from "../fields/plan-fields";
import { toChangePlanInput } from "./change-inputs";

export function ChangePlanDialog({ subscription }: { subscription: SubscriptionDetails }) {
  const t = useTranslations("consoleOrganizations.subscription.changePlan");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"));
  const change = useMutation(trpc.subscriptions.changePlan.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <ChangeDialog
      dialog={dialog}
      sending={change}
      label={t("action")}
      title={t("title")}
      description={t("description")}
    >
      <PlansOnSale subscription={subscription} change={change} />
    </ChangeDialog>
  );
}

function PlansOnSale({
  subscription,
  change,
}: {
  subscription: SubscriptionDetails;
  change: Sending<ChangePlanInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription.changePlan");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: false }));
  const onSale = plans.data?.filter((plan) => plan.forSale && !plan.archived);
  if (onSale) return <ChangePlanForm subscription={subscription} plans={onSale} change={change} />;
  return plans.isError ? (
    <ErrorState message={t("plansLoadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void plans.refetch()} />
  ) : (
    <div role="status" aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function ChangePlanForm({
  subscription,
  plans,
  change,
}: {
  subscription: SubscriptionDetails;
  /** The plans on sale. */
  plans: PlanSummary[];
  change: Sending<ChangePlanInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const current = plans.find((plan) => plan.id === subscription.plan.id);
  const { form, onSubmit } = useCheckedForm(
    { planId: current?.id ?? "", billingCycle: current ? cycleFor(current, subscription.billingCycle) : "" },
    (values) => toChangePlanInput(subscription.organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  const planId = useWatch({ control: form.control, name: "planId" });
  return (
    <form noValidate onSubmit={onSubmit(change.mutate)} className="flex flex-col gap-6">
      <FieldGroup>
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
      </FieldGroup>
      <FormFooter sending={change} label={t("changePlan.submit")} pendingLabel={t("changePlan.submitting")} />
    </form>
  );
}
