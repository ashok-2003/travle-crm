"use client";

// /packages/<id> (release 7b, one page since easy package editing): a trip's name and status line, a side index, and its
// four sections, each a short summary with Edit that saves that section alone: Prices & dates (with a group trip's price
// calendar, seasons and departures), Itinerary, Details & rules, and Page & files (publishing, the AI-sell switch,
// photos, brochures).
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink, TextLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { routes } from "@/lib/routes";
import { PackageHeader } from "./package-header";
import { sectionAnchors, type SectionKey } from "./package-section";
import { DetailsSection } from "./section-details";
import { ItinerarySection } from "./section-itinerary";
import { PageSection } from "./section-page";
import { PricesSection } from "./section-prices";
import { usePackage } from "./use-packages";

const sections: SectionKey[] = ["prices", "itinerary", "details", "page"];

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
                {sections.map((section) => (
                  <li key={section}>
                    <TextLink href={`#${sectionAnchors[section]}`}>{tSections(`${section}.title`)}</TextLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="flex min-w-0 flex-col gap-8">
              <PricesSection detail={data} />
              <ItinerarySection detail={data} />
              <DetailsSection detail={data} />
              <PageSection detail={data} />
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
