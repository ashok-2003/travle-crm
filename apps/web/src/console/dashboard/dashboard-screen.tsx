"use client";

// The console's dashboard (spec 7.4): every organization with its status, days left, seats used of the limit, last
// activity and this month's usage, oldest first, a page at a time. Loading shows rows of skeleton; an empty platform
// leads to onboarding the first organization; a failure says so with a Retry.
import { BuildingIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useWideScreen } from "@/lib/use-wide-screen";
import { consoleRoutes } from "../routes";
import { OrganizationsList } from "./organizations-list";
import { OrganizationsTable } from "./organizations-table";
import { useOrganizationsOverview } from "./use-organizations-overview";

export function DashboardScreen() {
  const t = useTranslations("console.dashboard");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const overview = useOrganizationsOverview();
  const { organizations } = overview;

  let content;
  if (organizations === undefined) {
    content = overview.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void overview.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  } else if (organizations.length === 0) {
    content = (
      <EmptyState
        icon={BuildingIcon}
        message={t("empty")}
        action={
          <Button asChild>
            <Link href={consoleRoutes.onboard}>{t("onboardFirst")}</Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        {wide ? (
          <OrganizationsTable organizations={organizations} />
        ) : (
          <OrganizationsList organizations={organizations} />
        )}
        {overview.hasNextPage && (
          <Button
            variant="outline"
            className="self-center"
            disabled={overview.isFetchingNextPage}
            onClick={() => void overview.fetchNextPage()}
          >
            {overview.isFetchingNextPage && <Spinner />}
            {overview.isFetchingNextPage ? t("loadingMore") : t("showMore")}
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      {content}
    </div>
  );
}
