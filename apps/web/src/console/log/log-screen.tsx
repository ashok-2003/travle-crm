"use client";

// The platform log (spec 5, 7): what platform staff and the platform's own jobs did, newest first, a page at a time.
// Loading shows rows of skeleton; an empty log says so; a failure says so with a Retry.
import { ScrollTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LogEntry } from "./log-entry";
import { useLogNames } from "./use-log-names";
import { usePlatformLog } from "./use-platform-log";

export function LogScreen() {
  const t = useTranslations("consolePlatform.log");
  const tCommon = useTranslations("common");
  const log = usePlatformLog();
  const { entries } = log;
  const names = useLogNames(entries);

  let content;
  if (entries === undefined) {
    content = log.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void log.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      </Delayed>
    );
  } else if (entries.length === 0) {
    content = <EmptyState icon={ScrollTextIcon} message={t("empty")} />;
  } else {
    content = (
      <>
        <ul className="divide-y rounded-lg border">
          {entries.map((entry) => (
            <LogEntry key={entry.id} entry={entry} names={names} />
          ))}
        </ul>
        {log.hasNextPage && (
          <Button
            variant="outline"
            className="self-center"
            disabled={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
          >
            {log.isFetchingNextPage && <Spinner />}
            {log.isFetchingNextPage ? t("loadingMore") : t("showMore")}
          </Button>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex max-w-[65ch] flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      {content}
    </div>
  );
}
