"use client";

// The organization's exports (spec 5, ADR 0023): everything it keeps, for it to take away before a deletion, each a
// job of the console's, kept for 7 days, and outliving a deletion. Newest first.
import { ArchiveIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { consoleRoutes } from "../routes";
import { ExportItem } from "./export-item";
import { useExportOrganization, useExports } from "./use-exports";

export function ExportsSection({ organizationId, canExport }: { organizationId: string; canExport: boolean }) {
  const t = useTranslations("consolePlatform.dataProtection.exports");
  const tCommon = useTranslations("common");
  const exports = useExports(organizationId);
  const ask = useExportOrganization();
  const hintId = useId();
  const preparing = exports.data?.some((entry) => entry.state === "requested") === true;

  const body = () => {
    if (exports.data) {
      if (exports.data.length === 0) return <EmptyState icon={ArchiveIcon} message={t("empty")} />;
      return (
        <ItemGroup>
          {exports.data.map((entry, index) => (
            <Fragment key={entry.exportId}>
              {index > 0 && <ItemSeparator />}
              <ExportItem entry={entry} />
            </Fragment>
          ))}
        </ItemGroup>
      );
    }
    if (exports.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void exports.refetch()} />
      );
    }
    return <LoadingRows rows={2} shape="twoLines" label={t("loading")} />;
  };

  return (
    <section aria-labelledby="organization-exports" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[65ch] flex-col gap-1">
          <h2 id="organization-exports" className="text-section font-semibold">
            {t("title")}
          </h2>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        {canExport && (
          <Button
            disabled={ask.isPending || preparing}
            aria-describedby={preparing ? hintId : undefined}
            onClick={() => {
              ask.mutate({ organizationId });
            }}
          >
            {ask.isPending ? t("exporting") : t("export")}
          </Button>
        )}
      </div>
      {preparing && (
        <p id={hintId} className="max-w-[65ch] text-caption text-muted-foreground">
          {t("preparing")} <TextLink href={consoleRoutes.jobs}>{t("seeJobs")}</TextLink>
        </p>
      )}
      {body()}
    </section>
  );
}
