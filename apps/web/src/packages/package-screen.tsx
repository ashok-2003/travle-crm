"use client";

// /packages/<id> (release 7b, one page since easy package editing, simplified after): a trip's name and status line, a
// side index, and its sections top to bottom: Prices (a group trip's price table, a custom trip's From price and tiers),
// Departures (group trips), Trip details, Page and AI (the AI switch, photos, brochures, publishing) and More (closed).
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink, TextLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { routes } from "@/lib/routes";
import { AiChangesCard } from "./ai-changes/ai-changes-card";
import { PackageHeader } from "./package-header";
import { sectionAnchors, type SectionKey } from "./package-section";
import { DeparturesCard } from "./departures-card";
import { CustomPricesCard, PricesCard } from "./prices-card";
import { MoreSection } from "./section-more";
import { PageSection } from "./section-page";
import { TripDetailsSection } from "./section-trip-details";
import { usePackage } from "./use-packages";

const sectionsOf = (group: boolean): SectionKey[] =>
  group ? ["prices", "departures", "details", "page", "more"] : ["prices", "details", "page", "more"];

export function PackageScreen({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.page");
  const tSections = useTranslations("packages.sections");
  const detail = usePackage(packageId);
  const body = () => {
    if (detail.data) {
      const data = detail.data;
      return (
        <>
          <PackageHeader detail={data} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] lg:items-start">
            <nav aria-label={t("index")} className="lg:sticky lg:top-6">
              <ul className="flex flex-wrap gap-x-4 lg:flex-col">
                {sectionsOf(data.kind === "group").map((section) => (
                  <li key={section}>
                    <TextLink href={`#${sectionAnchors[section]}`}>{tSections(`${section}.title`)}</TextLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex min-w-0 flex-col gap-8">
              <AiChangesCard packageId={data.id} />
              {data.kind === "group" ? (
                <>
                  <PricesCard detail={data} />
                  <DeparturesCard detail={data} />
                </>
              ) : (
                <CustomPricesCard detail={data} />
              )}
              <TripDetailsSection detail={data} />
              <PageSection detail={data} />
              <MoreSection detail={data} />
            </div>
          </div>
        </>
      );
    }
    if (refusalOf(detail.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (detail.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={detail.error}
          retryLabel={t("retry")}
          onRetry={() => void detail.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={routes.packages} label={t("back")} />
      {body()}
    </div>
  );
}
