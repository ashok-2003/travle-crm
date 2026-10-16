"use client";

// The audit log screen (spec 9.5): every change made in the organization, newest first, a page at a time, or one
// record's history when the address names one. Loading shows rows of skeleton; nothing recorded says so; a failure
// says what failed, with a Retry, and a refusal its reason (a missing permission, a shut organization).
import { HistoryIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { AuditEntries } from "./audit-entries";
import { recordFilterOf } from "./record-filter";
import { useAuditLog } from "./use-audit-log";
import { LoadingRows } from "@/components/loading-rows";
import { ShowMoreButton } from "@/components/show-more-button";

export function AuditScreen() {
  const t = useTranslations("audit");
  const tCommon = useTranslations("common");
  const record = recordFilterOf(useSearchParams());
  const log = useAuditLog(record);
  const entries = log.items;
  const { apiError } = useErrorMessage();
  const failure = (unanswered: string) => (refusalOf(log.error)?.reason ? apiError(log.error) : unanswered);

  let content;
  if (entries === undefined) {
    content = log.isError ? (
      <ErrorState
        message={failure(t("loadFailed"))}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void log.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" />
    );
  } else if (entries.length === 0) {
    content = <EmptyState icon={HistoryIcon} message={record ? t("emptyRecord") : t("empty")} />;
  } else {
    content = (
      <>
        <AuditEntries entries={entries} recordLinks={record === null} />
        {log.isFetchNextPageError && (
          <p role="alert" className="text-center">
            {failure(t("moreFailed"))}
          </p>
        )}
        <ShowMoreButton pages={log} label={t("showMore")} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {record && (
        <div className="flex flex-wrap items-center gap-x-6">
          <p className="font-medium">{t("oneRecord", { kind: record.entityType })}</p>
          <Button variant="link" className="px-0" asChild>
            <Link href={routes.audit}>{t("showEverything")}</Link>
          </Button>
        </div>
      )}
      {content}
    </div>
  );
}
