"use client";

// Step 4 when the add has ended (spec 3.2 step 4, B28, B31, B34, B36): Done, Stopped or Failed with the counts, the
// reason when it did not finish, the report of the rows not added to download (an export: a read-only agency may),
// when its file is kept until, and the way to the imported leads, which is the Leads list filtered by source Import.
import type { ImportDetail } from "@travel-crm/contracts/imports";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPCClient } from "@/data/trpc";
import { useDownload } from "@/files/use-download";
import { ImportCounts } from "@/imports/import-counts";
import { ImportStatusBadge } from "@/imports/import-status-badge";
import { formatCount, formatDay, formatDayTime } from "@/lib/format";
import { routes } from "@/lib/routes";
import { listFiltersHref } from "../list/list-filters";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

const summaryOf = { done: "summaryDone", stopped: "summaryStopped", failed: "summaryFailed" } as const;
const titleOf = { done: "title", stopped: "titleStopped", failed: "titleFailed" } as const;

export function DoneStep({ detail }: { detail: ImportDetail }) {
  const t = useTranslations("leads.import.done");
  const tFailures = useTranslations("imports.failures");
  const { timeZone } = useMe().organization;
  const client = useTRPCClient();
  const write = useWriteAccess("export");
  const hintId = useId();
  const download = useDownload((importId: string) => client.leadImports.reportLink.mutate({ importId }));
  const outcomes = detail.counts?.outcomes;
  const notAdded = (outcomes?.not_added ?? 0) + (outcomes?.left_out ?? 0);
  const status = detail.status === "stopped" || detail.status === "failed" ? detail.status : "done";
  const finished = new Date(detail.finishedAt ?? detail.createdAt);
  const reason = detail.failureReason === null ? null : tFailures(detail.failureReason);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader
        title={t(titleOf[status])}
        intro={t("file", { name: detail.fileName, day: formatDayTime(finished, { timeZone }) })}
        action={<ImportStatusBadge status={detail.status} />}
      />
      {/* Said to a screen reader as the add ends, wherever the importer's attention was. */}
      <p role="status" className="sr-only">
        {t("summary", {
          status: t(summaryOf[status]),
          added: outcomes?.added ?? 0,
          merged: outcomes?.merged ?? 0,
          notAdded,
        })}
      </p>
      {status !== "done" && reason !== null && (
        <Alert variant={status === "failed" ? "destructive" : "default"}>
          <AlertDescription>{tFailures("stopped", { reason })}</AlertDescription>
        </Alert>
      )}
      <ImportCounts
        items={[
          { label: t("newLeads"), count: outcomes?.added ?? 0 },
          { label: t("repeatEnquiries"), count: outcomes?.merged ?? 0 },
          { label: t("notAdded"), count: notAdded },
        ]}
      />
      {detail.report !== null && notAdded > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {t("notAddedTitle", { count: formatCount(notAdded) })}
            </CardTitle>
            <CardDescription>{t("notAddedBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-2">
            <Button
              disabled={!write.allowed || download.isPending}
              aria-describedby={write.hint ? hintId : undefined}
              onClick={() => {
                download.mutate(detail.id);
              }}
            >
              {t("download", { count: notAdded })}
            </Button>
            <WriteHint id={hintId} hint={write.hint} />
            <p className="text-label text-muted-foreground">
              {t("kept", { name: detail.report.fileName, day: formatDay(new Date(detail.keepUntil), { timeZone }) })}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={listFiltersHref({ view: "everyone", source: "bulk_upload" })}>{t("see")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.leadImport}>{t("importAnother")}</Link>
        </Button>
      </div>
    </div>
  );
}
