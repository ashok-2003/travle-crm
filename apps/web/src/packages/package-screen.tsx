"use client";

// /packages/<id> (release 7b): one package. Its words and price, its tiers (each a set of lines priced from the supplier rates
// when a quote is made), its photos, and publishing its page at /a/<sign-in code>/<package>.
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { routes } from "@/lib/routes";
import { PackageForm, savedKey } from "./package-form";
import { PackagePhotos } from "./package-photos";
import { PublishCard } from "./publish-card";
import { SellCard } from "./sell-card";
import { TiersCard } from "./tiers-card";
import { usePackage } from "./use-packages";

export function PackageScreen({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.page");
  const detail = usePackage(packageId);
  const body = () => {
    if (detail.data) {
      const data = detail.data;
      return (
        <>
          <BackLink href={routes.quotes} label={t("back")} />
          <PageHeader title={data.name} intro={t("intro")} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            {/* Keyed by the saved package, so a save shows what was kept. */}
            <PackageForm key={savedKey(data)} detail={data} />
            <div className="flex flex-col gap-6 xl:sticky xl:top-6">
              <PublishCard detail={data} />
              {data.kind === "group" && <SellCard detail={data} />}
              <TiersCard detail={data} />
              <PackagePhotos packageId={data.id} />
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
    <div className="flex max-w-[1200px] flex-col gap-6">
      {detail.data === undefined && <BackLink href={routes.quotes} label={t("back")} />}
      {body()}
    </div>
  );
}
