"use client";

// /leads/import/<importId> (spec 3.2): one lead import at whichever step its status says (D37), so leaving and coming
// back finds it where it was: reading, can't be read, matching the columns, checking and the preview, adding, and
// the end. From the preview, Change the columns goes back to matching (B13) and runs the check again.
import type { ImportDetail } from "@travel-crm/contracts/imports";
import { FileXIcon, LoaderCircleIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { FocusedStep } from "@/components/focused-step";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { routes } from "@/lib/routes";
import { AddingStep } from "./adding-step";
import { CheckStep } from "./check-step";
import { DoneStep } from "./done-step";
import { MatchStep } from "./match-step";
import { useLeadImport } from "./use-lead-import";

export function LeadImportScreen({ importId }: { importId: string }) {
  const t = useTranslations("leads.import");
  const tCommon = useTranslations("common");
  const { data: detail, isError, error, refetch } = useLeadImport(importId);
  const [changing, setChanging] = useState(false);

  if (detail === undefined) {
    if (isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape="twoLines" />;
  }

  return (
    <FocusedStep stepKey={`${detail.status}-${String(changing)}`}>
      <Step detail={detail} changing={changing} setChanging={setChanging} />
    </FocusedStep>
  );
}

function Step({
  detail,
  changing,
  setChanging,
}: {
  detail: ImportDetail;
  changing: boolean;
  setChanging: (changing: boolean) => void;
}) {
  const t = useTranslations("leads.import");
  const tUnreadable = useTranslations("imports.unreadable");
  switch (detail.status) {
    case "uploading":
    case "reading":
      return (
        <div className="flex max-w-[720px] flex-col gap-6">
          <BackLink href={routes.leads} label={t("back")} />
          <PageHeader title={t("title")} />
          <ImportStepCaption status={detail.status} />
          <div role="status" className="flex items-center gap-3">
            <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
            <div>
              <p className="wrap-anywhere script-leading">{t("reading", { name: detail.fileName })}</p>
              <p className="text-label text-muted-foreground">{t("readingWait")}</p>
            </div>
          </div>
        </div>
      );
    case "unreadable":
      return (
        <div className="flex max-w-[720px] flex-col gap-6">
          <BackLink href={routes.leads} label={t("back")} />
          <PageHeader title={t("title")} />
          <Alert variant="destructive">
            <AlertTitle className="wrap-anywhere">{tUnreadable("title", { name: detail.fileName })}</AlertTitle>
            <AlertDescription>
              {detail.unreadableReason === null ? null : tUnreadable(detail.unreadableReason, { rows: "10,000" })}
            </AlertDescription>
          </Alert>
          <Button asChild className="self-start">
            <Link href={routes.leadImport}>{tUnreadable("chooseAnother")}</Link>
          </Button>
        </div>
      );
    case "matching":
      return <MatchStep detail={detail} />;
    case "checking":
      return <CheckStep detail={detail} />;
    case "checked":
      return changing ? (
        <MatchStep
          detail={detail}
          onBack={() => {
            setChanging(false);
          }}
          // The columns matched again start a new check, which ends changing them.
          onChecked={() => {
            setChanging(false);
          }}
        />
      ) : (
        <CheckStep
          detail={detail}
          onChangeColumns={() => {
            setChanging(true);
          }}
        />
      );
    case "adding":
      return <AddingStep detail={detail} />;
    case "done":
    case "stopped":
    case "failed":
      return <DoneStep detail={detail} />;
    case "cancelled":
    case "expired":
      return (
        <EmptyState
          icon={FileXIcon}
          message={t(detail.status === "cancelled" ? "gone.cancelled" : "gone.expired")}
          action={
            <Button asChild>
              <Link href={routes.leadImport}>{t("gone.again")}</Link>
            </Button>
          }
        />
      );
  }
}
