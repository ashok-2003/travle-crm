"use client";

// One organization's data protection (spec 5, ADR 0023), a super admin's alone: its exports, its deletion for good,
// and one person's or record's export and erasure. Once the organization is deleted, its exports stay downloadable for
// their 7 days, and nothing else is offered. Support is told the screen is a super admin's, and nothing is asked.
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { refusalOf } from "@/data/api-error";
import { useConsoleTRPC } from "../data/console-trpc";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { ExportsSection } from "./exports-section";
import { PurgeSection } from "./purge-section";
import { SubjectSection } from "./subject-section";
import { useExports } from "./use-exports";

function Sections({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consolePlatform.dataProtection");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const details = useQuery(trpc.organizations.get.queryOptions({ organizationId }));
  const exports = useExports(organizationId);
  const deleted = refusalOf(details.error)?.reason === "ORGANIZATION_NOT_FOUND";
  // Once deleted, whatever was held of it is no longer shown.
  const organization = deleted ? undefined : details.data;

  if (!organization && !deleted) {
    return details.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void details.refetch()} />
    ) : (
      <Skeleton role="status" aria-busy="true" aria-label={t("loading")} className="h-40 w-full" />
    );
  }
  return (
    <>
      {organization ? (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-section font-semibold script-leading">{organization.organization.name}</span>
          <span className="numbers text-muted-foreground">{organization.organization.code}</span>
        </p>
      ) : (
        <p role="status">{t("deleted")}</p>
      )}
      <ExportsSection organizationId={organizationId} canExport={!deleted} />
      {organization && <PurgeSection details={organization} exports={exports.data} />}
      {organization && <SubjectSection organization={organization.organization} />}
    </>
  );
}

export function DataProtectionScreen({ organizationId }: { organizationId: string }) {
  const t = useTranslations("consolePlatform.dataProtection");
  const tErrors = useTranslations("errors");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-[65ch] flex-col gap-2">
        <Link
          href={consoleRoutes.organization(organizationId)}
          className="inline-flex min-h-11 items-center gap-1 self-start text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          {t("backToOrganization")}
        </Link>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {superAdmin ? <Sections organizationId={organizationId} /> : <p>{tErrors("reasons.SUPER_ADMIN_ONLY")}</p>}
    </div>
  );
}
