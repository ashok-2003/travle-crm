"use client";

// /settings/lead-sources (spec 6.5): the Google Sheets whose new rows become leads by themselves, each with its tab,
// when it was last checked and its state, and Connect a sheet, which is off at the limit, where Google Sheets isn't set
// up, in the demo and while the subscription refuses changes, each with the reason as the button's description.
import { FileSpreadsheetIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { BackToSettings } from "@/components/back-to-settings";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { sheetConnectRoute } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SheetList } from "./sheet-list";
import { useLeadSheets } from "./use-lead-sheets";
import { WebsiteFormRow } from "./website-form/website-form-row";

export function LeadSourcesScreen() {
  const t = useTranslations("sheets.list");
  const tCommon = useTranslations("common");
  const sheets = useLeadSheets();
  const write = useWriteAccess("change");
  const hintId = useId();
  const list = sheets.data;

  /** Why Connect a sheet is off, if it is: ours first, then the subscription's. */
  const reason =
    list === undefined
      ? null
      : !list.configured
        ? t("notSetUp")
        : list.demo
          ? t("demo")
          : list.items.length >= list.limit
            ? t("limitHint", { limit: list.limit })
            : null;
  const off = list === undefined || reason !== null || !write.allowed;
  const connect = (
    <div className="flex flex-col items-start gap-2">
      {off ? (
        <Button disabled aria-describedby={reason !== null || write.hint !== null ? hintId : undefined}>
          {t("connect")}
        </Button>
      ) : (
        <Button asChild>
          <Link href={sheetConnectRoute}>{t("connect")}</Link>
        </Button>
      )}
      {reason === null ? (
        <WriteHint id={hintId} hint={write.hint} />
      ) : (
        <FieldDescription id={hintId} className="max-w-[40ch]">
          {reason}
        </FieldDescription>
      )}
    </div>
  );

  const body = () => {
    if (list !== undefined) {
      if (list.items.length === 0) return <EmptyState icon={FileSpreadsheetIcon} message={t("empty")} />;
      return (
        <section className="flex flex-col gap-3" aria-labelledby="sheets-heading">
          <div className="flex items-baseline gap-3">
            <h2 id="sheets-heading" className="text-section font-semibold">
              {t("heading")}
            </h2>
            <span className="numbers text-label text-muted-foreground">
              {t("count", { count: list.items.length, limit: list.limit })}
            </span>
          </div>
          <SheetList items={list.items} />
        </section>
      );
    }
    if (sheets.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={sheets.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void sheets.refetch()}
        />
      );
    }
    return <LoadingRows rows={3} shape="twoLines" />;
  };

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} action={list === undefined ? undefined : connect} />
      {body()}
      <WebsiteFormRow />
    </div>
  );
}
