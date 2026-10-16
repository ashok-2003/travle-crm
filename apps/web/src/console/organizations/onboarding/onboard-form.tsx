"use client";

// The onboarding form: the agency, its business profile, its Owner and its subscription, checked by the api's own
// schema before it is sent (problems under their fields); a refusal shows above the button, keeping what was typed.
// Onboarded, it opens the organization's page, which says the Owner's invite is on its way.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC } from "../../data/console-trpc";
import { consoleRoutes } from "../../routes";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { AgencyFields, OwnerFields, ProfileFields } from "./agency-fields";
import { emptyOnboardValues, toOnboardInput } from "./onboard-values";
import { SubscriptionFields } from "./subscription-fields";

/** The plans on sale, or what stands in for them while they load, failed or are none. */
export type PlansOnSale = { plans: PlanSummary[]; trialDays: number | null } | { placeholder: ReactNode };

export function OnboardForm({ plansOnSale }: { plansOnSale: PlansOnSale }) {
  const t = useTranslations("consoleOrganizations.onboard");
  const { apiError } = useErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  const onboard = useMutation(
    trpc.organizations.onboard.mutationOptions({
      onSuccess: async ({ organizationId }) => {
        await queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() });
        router.push(`${consoleRoutes.organization(organizationId)}?onboarded=1`);
      },
    }),
  );
  const { form, onSubmit, formProblem } = useCheckedForm(emptyOnboardValues(), toOnboardInput, (problem) =>
    t(`problems.${problem}`),
  );
  const ready = "plans" in plansOnSale;

  return (
    <form noValidate onSubmit={onSubmit(onboard.mutate)} className="flex max-w-xl flex-col gap-8">
      <AgencyFields control={form.control} />
      <ProfileFields control={form.control} />
      <OwnerFields control={form.control} />
      <FieldSet>
        <FieldLegend className="text-section font-semibold">{t("subscription.heading")}</FieldLegend>
        {ready ? (
          <SubscriptionFields form={form} plans={plansOnSale.plans} trialDays={plansOnSale.trialDays} />
        ) : (
          plansOnSale.placeholder
        )}
      </FieldSet>
      {(formProblem !== undefined || onboard.isError) && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{formProblem ?? apiError(onboard.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={!ready || onboard.isPending} className="self-start">
        {onboard.isPending && <Spinner />}
        {onboard.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
