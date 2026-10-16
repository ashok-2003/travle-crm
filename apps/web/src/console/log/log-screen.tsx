"use client";

// The platform log (spec 5, 7): what platform staff and the platform's own jobs did, newest first, a page at a time.
// Loading shows rows of skeleton; an empty log says so; a failure says so with a Retry.
import { ScrollTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { LogEntry } from "./log-entry";
import { useLogNames } from "./use-log-names";
import { usePlatformLog } from "./use-platform-log";

export function LogScreen() {
  const t = useTranslations("consolePlatform.log");
  const tCommon = useTranslations("common");
  const log = usePlatformLog();
  const { items: entries } = log;
  const names = useLogNames(entries);

  let content;
  if (entries === undefined) {
    content = log.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void log.refetch()} />
    ) : (
      <LoadingRows rows={4} shape="twoLines" label={t("loading")} />
    );
  } else if (entries.length === 0) {
    content = <EmptyState icon={ScrollTextIcon} message={t("empty")} />;
  } else {
    content = (
      <>
        <ItemGroup>
          {entries.map((entry, index) => (
            <Fragment key={entry.id}>
              {index > 0 && <ItemSeparator />}
              <LogEntry entry={entry} names={names} />
            </Fragment>
          ))}
        </ItemGroup>
        <ShowMoreButton pages={log} label={t("showMore")} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {content}
    </div>
  );
}
