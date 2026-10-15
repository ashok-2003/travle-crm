"use client";

// The audit log screen (spec 9.5): every change made in the organization, newest first, a page at a time, or one
// record's history when the address names one. Loading shows rows of skeleton; nothing recorded says so; a failure
// says what failed, with a Retry.
import { HistoryIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/lib/routes";
import { AuditEntries } from "./audit-entries";
import { recordFilterOf } from "./record-filter";
import { useAuditLog } from "./use-audit-log";

export function AuditScreen() {
  const t = useTranslations("audit");
  const tCommon = useTranslations("common");
  const record = recordFilterOf(useSearchParams());
  const log = useAuditLog(record);
  const { entries } = log;

  let content;
  if (entries === undefined) {
    content = log.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void log.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={tCommon("loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-20 w-full" />
          ))}
        </div>
      </Delayed>
    );
  } else if (entries.length === 0) {
    content = <EmptyState icon={HistoryIcon} message={record ? t("emptyRecord") : t("empty")} />;
  } else {
    content = (
      <>
        <AuditEntries entries={entries} recordLinks={record === null} />
        {log.isFetchNextPageError && (
          <p role="alert" className="text-center">
            {t("moreFailed")}
          </p>
        )}
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
      {record && (
        <div className="flex flex-wrap items-center gap-x-6">
          <p className="font-medium">{t("oneRecord", { kind: record.entityType })}</p>
          <Link href={routes.audit} className="flex min-h-11 w-fit items-center text-primary hover:underline">
            {t("showEverything")}
          </Link>
        </div>
      )}
      {content}
    </div>
  );
}
