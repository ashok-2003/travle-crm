"use client";

// /settings/lead-sources/sheets/<sheetId> (spec 6.5): one connected sheet. Its name, state and who connected it and when,
// Sync now and the ⋯ menu; what stopped it, if anything, with the one thing to do; the four counts; the rows that
// couldn't be added; and how its columns are matched. It asks again every 2 seconds while a check runs and every 30
// otherwise, so the time and the counts move by themselves.
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { formatDay } from "@/lib/format";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { lastCheckedText } from "../last-checked";
import { SheetStatusBadge } from "../sheet-status-badge";
import { useLeadSheet } from "../use-lead-sheets";
import { AttentionAlert } from "./attention-alert";
import { SheetActions } from "./sheet-actions";
import { SheetColumnsCard } from "./sheet-columns-card";
import { SheetCounts } from "./sheet-counts";
import { SheetDetails } from "./sheet-details";
import { SheetProblems } from "./sheet-problems";
import { SyncNowButton } from "./sync-now-button";

export function SheetScreen({ sheetId }: { sheetId: string }) {
  const t = useTranslations("sheets.sheet");
  const tCommon = useTranslations("common");
  const { timeZone } = useMe().organization;
  const sheet = useLeadSheet(sheetId);
  const detail = sheet.data;

  if (detail === undefined) {
    if (sheet.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={sheet.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void sheet.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" />;
  }

  const day = detail.connectedAt === null ? "" : formatDay(new Date(detail.connectedAt), { timeZone });
  const who = detail.connectedBy?.name ?? null;
  const subtitle =
    who === null
      ? t("subtitleUnknown", { tab: detail.tabTitle, day })
      : t("subtitle", { tab: detail.tabTitle, name: who, day });
  const checked =
    detail.lastCheckedAt === null
      ? t("notChecked")
      : t("lastChecked", { when: lastCheckedText(new Date(detail.lastCheckedAt), { timeZone }) });

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <BackLink href={routes.leadSources} label={t("back")} />
      <PageHeader
        title={detail.sheetTitle}
        intro={
          <span className="flex flex-col items-start gap-2">
            <SheetStatusBadge status={detail.status} />
            <span>{subtitle}</span>
          </span>
        }
        action={
          <div className="flex items-start gap-2">
            <SyncNowButton detail={detail} />
            <SheetActions detail={detail} />
          </div>
        }
      />
      <div className="flex flex-col gap-1">
        <p className="numbers text-label text-muted-foreground">{checked}</p>
        {detail.late && <p className="text-label text-muted-foreground">{t("late")}</p>}
      </div>
      <AttentionAlert detail={detail} />
      <SheetCounts detail={detail} />
      {detail.counts.couldntBeAdded > 0 && <SheetProblems sheetId={detail.id} />}
      <SheetColumnsCard detail={detail} />
      <SheetDetails detail={detail} />
    </div>
  );
}
