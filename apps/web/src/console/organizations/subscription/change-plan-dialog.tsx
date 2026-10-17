"use client";

// Moving an organization to another plan or billing cycle (subscriptions.changePlan), from the subscription's Change
// menu: a plan on sale and a cycle it is sold on, starting from the current ones while the current plan is on sale,
// and from nothing chosen once it isn't. The plans load when the dialog opens, and the form can be sent once they
// have; failing, it says so with Try again.
import type { ChangePlanInput, PlanSummary, SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useWatch } from "react-hook-form";
import { ErrorState } from "@/components/error-state";
import { FormAlert, FormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadingRows } from "@/components/loading-rows";
import { FieldGroup } from "@/components/ui/field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useConsoleTRPC } from "../../data/console-trpc";
import { useChangeDialog } from "../change-dialog";
import { cycleFor, PlanFields } from "../fields/plan-fields";
import { toChangePlanInput } from "./change-inputs";

export function ChangePlanDialog({
  subscription,
  state,
  returnFocusTo,
}: {
  subscription: SubscriptionDetails;
  state: OpenState;
  /** The Change menu's button, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("consoleOrganizations.subscription.changePlan");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const dialog = useChangeDialog(subscription.organizationId, t("done"), state);
  const change = useMutation(trpc.subscriptions.changePlan.mutationOptions({ onSuccess: dialog.onSuccess }));
  const plans = useQuery({ ...trpc.plans.list.queryOptions({ includeArchived: false }), enabled: dialog.open });
  const onSale = plans.data?.filter((plan) => plan.forSale && !plan.archived);
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={dialog}
      sending={change}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
      canSubmit={onSale !== undefined}
    >
      {(formId) => {
        if (onSale)
          return <ChangePlanForm formId={formId} subscription={subscription} plans={onSale} change={change} />;
        return plans.isError ? (
          <ErrorState
            message={t("plansLoadFailed")}
            error={plans.error}
            retryLabel={tCommon("tryAgain")}
            onRetry={() => void plans.refetch()}
          />
        ) : (
          <LoadingRows rows={2} label={t("loading")} />
        );
      }}
    </FormDialog>
  );
}

function ChangePlanForm({
  formId,
  subscription,
  plans,
  change,
}: {
  formId: string;
  subscription: SubscriptionDetails;
  /** The plans on sale. */
  plans: PlanSummary[];
  change: Sending<ChangePlanInput>;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const current = plans.find((plan) => plan.id === subscription.plan.id);
  const { form, onSubmit, formProblem } = useCheckedForm(
    { planId: current?.id ?? "", billingCycle: current ? cycleFor(current, subscription.billingCycle) : "" },
    (values) => toChangePlanInput(subscription.organizationId, values),
    (problem) => t(`problems.${problem}`),
  );
  const planId = useWatch({ control: form.control, name: "planId" });
  return (
    <form id={formId} noValidate onSubmit={onSubmit(change.mutate)} className="flex flex-col gap-6">
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
      <FormAlert sending={change} problem={formProblem} />
    </form>
  );
}
