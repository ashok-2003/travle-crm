"use client";

// One organization's data protection (spec 5, ADR 0023), a super admin's alone: its exports, its deletion for good,
// and one person's or record's export and erasure. Once the organization is deleted, its exports stay downloadable for
// their 7 days, and nothing else is offered. Support is told the screen is a super admin's, and nothing is asked.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
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
      <LoadingRows rows={2} shape="twoLines" label={t("loading")} />
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
      {/* Kept once deleted, for its result to be read; its button is spent by then. */}
      {details.data && <PurgeSection details={details.data} exports={exports.data} />}
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
      <BackLink href={consoleRoutes.organization(organizationId)} label={t("backToOrganization")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      {superAdmin ? <Sections organizationId={organizationId} /> : <p>{tErrors("reasons.SUPER_ADMIN_ONLY")}</p>}
    </div>
  );
}
