"use client";

// /console/organizations/<id>: one organization as the console shows it (organizations.get): its name, sign-in code
// and status today; just after onboarding, that the Owner's invite is on its way. An organization that doesn't exist
// (purged, or a mistyped address) is said so, with the way back to the dashboard.
import { useQuery } from "@tanstack/react-query";
import { CircleCheckIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { refusalOf } from "@/data/api-error";
import { useConsoleTRPC } from "../../data/console-trpc";
import { consoleRoutes } from "../../routes";
import { SubscriptionStatusBadge } from "../../subscription-status";

export function OrganizationScreen({ organizationId, onboarded }: { organizationId: string; onboarded: boolean }) {
  const t = useTranslations("consoleOrganizations.organization");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const details = useQuery(trpc.organizations.get.queryOptions({ organizationId }));

  if (!details.data) {
    const status = refusalOf(details.error)?.status;
    // A malformed id is refused as invalid input: to the person, both are no such organization.
    if (status === 404 || status === 400) {
      return (
        <EmptyState
          icon={SearchXIcon}
          message={t("notFound")}
          action={
            <Button asChild variant="outline">
              <Link href={consoleRoutes.home}>{t("backToDashboard")}</Link>
            </Button>
          }
        />
      );
    }
    return details.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void details.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Delayed>
    );
  }

  const { organization, subscription } = details.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageTitle className="text-balance break-words script-leading">{organization.name}</PageTitle>
        <p className="flex flex-wrap items-center gap-3">
          <span className="numbers">{organization.code}</span>
          <SubscriptionStatusBadge status={subscription?.subscription.status ?? null} />
        </p>
      </div>
      {onboarded && (
        <Alert>
          <CircleCheckIcon aria-hidden="true" />
          <AlertDescription>{t("onboarded")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
