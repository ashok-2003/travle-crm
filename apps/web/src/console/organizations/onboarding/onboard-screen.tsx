"use client";

// /console/organizations/new: onboarding an agency (spec 7.1). The plans on sale (plans.list, the demo's own and
// archived ones left out) and the policy's trial length load first; until they have, or if they fail or none is on
// sale, the subscription's part says so and the form can't be sent.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConsoleTRPC } from "../../data/console-trpc";
import { consoleRoutes } from "../../routes";
import { OnboardForm, type PlansOnSale } from "./onboard-form";

export function OnboardScreen() {
  const t = useTranslations("consoleOrganizations.onboard");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: false }));
  const policy = useQuery(trpc.plans.policy.queryOptions());
  const onSale = plans.data?.filter((plan) => plan.forSale && !plan.archived);

  let plansOnSale: PlansOnSale;
  if (onSale && onSale.length > 0) {
    plansOnSale = { plans: onSale, trialDays: policy.data?.trialDays ?? null };
  } else if (onSale) {
    plansOnSale = {
      placeholder: (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">{t("subscription.noPlans")}</p>
          <Button asChild variant="outline">
            <Link href={consoleRoutes.plans}>{t("subscription.plansLink")}</Link>
          </Button>
        </div>
      ),
    };
  } else if (plans.isError) {
    plansOnSale = {
      placeholder: (
        <ErrorState
          message={t("subscription.plansLoadFailed")}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void plans.refetch()}
        />
      ),
    };
  } else {
    plansOnSale = {
      placeholder: (
        <Delayed>
          <div role="status" aria-busy="true" aria-label={t("subscription.loading")} className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Delayed>
      ),
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="max-w-[65ch] text-pretty text-muted-foreground">{t("intro")}</p>
      </div>
      <OnboardForm plansOnSale={plansOnSale} />
    </div>
  );
}
