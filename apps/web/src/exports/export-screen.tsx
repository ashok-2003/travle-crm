"use client";

// An export's page (spec 3.3, B42, B54), where the bell's "Your leads export is ready" leads: what it holds, its format
// and state, its progress while the worker makes it, and the file with Download until it is deleted 24 hours after it
// was ready; then "This file was deleted after 24 hours.", and a failed export says why. A way back to the list
// opens it. Downloading is an export (ADR 0021): a read-only agency may, a cancelled one may not.
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Details } from "@/components/details";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/files/file-size";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { rowsWordOf, useExportFailure } from "./export-failure";
import { ExportProgress } from "./export-progress";
import { ExportStatusBadge } from "./export-status-badge";
import { useExport, type ExportCalls } from "./use-export";

export function ExportScreen({
  title,
  holds,
  calls,
  exportId,
  back,
}: {
  title: string;
  /** What the file holds, as the list showed it when it was asked for. */
  holds: ReactNode;
  calls: ExportCalls;
  exportId: string;
  /** The list the export was made from. */
  back: { href: string; label: string };
}) {
  const t = useTranslations("exports");
  const tCommon = useTranslations("common");
  const id = useId();
  const write = useWriteAccess("export");
  const failure = useExportFailure();
  const { detail, download } = useExport(calls, exportId);

  const body = () => {
    const shown = detail.data;
    if (shown) {
      const file = shown.status === "ready" ? shown.file : null;
      const problem = failure(shown);
      return (
        <>
          <Details
            rows={[
              { label: t("dialog.holds"), value: holds },
              { label: t("dialog.format"), value: t(`formats.${shown.format}`) },
              { label: t("page.state"), value: <ExportStatusBadge status={shown.status} /> },
              ...(file
                ? [
                    { label: t("page.file"), value: file.fileName },
                    { label: t("page.size"), value: formatFileSize(file.sizeBytes) },
                  ]
                : []),
            ]}
          />
          {shown.status === "making" && <ExportProgress detail={shown} rowsWord={rowsWordOf(shown.kind)} />}
          {problem !== null && (
            <Alert variant={shown.status === "failed" ? "destructive" : "default"}>
              {shown.status === "failed" ? <CircleAlertIcon aria-hidden="true" /> : <InfoIcon aria-hidden="true" />}
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          {file && (
            <div className="flex flex-col items-start gap-2">
              <Button
                disabled={!write.allowed || download.isPending}
                aria-describedby={write.hint ? `${id}-hint` : undefined}
                onClick={() => {
                  download.mutate(exportId);
                }}
              >
                {t("dialog.download")}
              </Button>
              <WriteHint id={`${id}-hint`} hint={write.hint} />
            </div>
          )}
        </>
      );
    }
    if (detail.isError) {
      return (
        <ErrorState
          message={t("page.loadFailed")}
          error={detail.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void detail.refetch()}
        />
      );
    }
    return <LoadingRows rows={3} />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={back.href} label={back.label} />
      <PageHeader title={title} />
      {body()}
    </div>
  );
}
