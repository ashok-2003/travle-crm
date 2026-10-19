"use client";

// A staff import at whichever step it is (spec 3.2, 3.4): one address per import, so leaving and coming back finds it
// where it was. The page is asked for again every 2 seconds while the worker reads, checks or adds. The passwords made
// for Add live in this tab's memory (password-store.ts) and are forgotten when this screen goes, and when the import
// returns to its preview.
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ImportProgress } from "@/imports/import-progress";
import { ImportStepCaption } from "@/imports/import-step-caption";
import { routes } from "@/lib/routes";
import { StaffCheckStep } from "./staff-check-step";
import { PasswordsStep } from "./passwords-step";
import { passwordStore } from "./password-store";
import { StaffMatchStep } from "./staff-match-step";
import { useStaffImport, type StaffImportPage } from "./use-staff-import";
import { importRowLimits } from "@travel-crm/contracts/imports";

/** Where an import that is over goes on: the first step again. */
function Ended({ page }: { page: StaffImportPage }) {
  const t = useTranslations("staff.import");
  const tImports = useTranslations("imports");
  const reason =
    page.status === "failed" && page.failureReason !== null ? tImports(`failures.${page.failureReason}`) : null;
  return (
    <>
      <PageHeader title={t(`ended.${page.status === "failed" ? "failed" : "over"}`)} />
      {reason !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{tImports("failures.stopped", { reason })}</AlertDescription>
        </Alert>
      )}
      <TextLink href="/staff/import">{t("startAnother")}</TextLink>
    </>
  );
}

export function StaffImportScreen({ importId }: { importId: string }) {
  const t = useTranslations("staff.import");
  const tImports = useTranslations("imports");
  const tCommon = useTranslations("common");
  const detail = useStaffImport(importId);
  const [changing, setChanging] = useState(false);
  const status = detail.data?.status;
  // A step is a new page to someone who can't see it change: focus goes to its h1 when the step does, and the end of the
  // add is announced.
  const screen = useRef<HTMLDivElement>(null);
  const steppedFrom = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (status === undefined) return;
    const before = steppedFrom.current;
    steppedFrom.current = status;
    if (before === undefined || before === status) return;
    const heading = screen.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [status]);
  // Leaving forgets the passwords, and so does the import coming back to its preview (a row changed, too few seats).
  useEffect(
    () => () => {
      passwordStore.forget(importId);
    },
    [importId],
  );
  useEffect(() => {
    if (status === "checked") passwordStore.forget(importId);
  }, [status, importId]);

  const body = (page: StaffImportPage) => {
    switch (page.status) {
      case "uploading":
      case "reading":
        return (
          <>
            <PageHeader title={t("title")} />
            <p className="flex items-center gap-2" role="status">
              <Spinner />
              {tImports("file.reading", { name: page.fileName })}
            </p>
          </>
        );
      case "unreadable":
        return (
          <>
            <PageHeader title={tImports("unreadable.title", { name: page.fileName })} />
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>
                {tImports(`unreadable.${page.unreadableReason ?? "not_a_spreadsheet"}`, {
                  rows: importRowLimits.staff,
                })}
              </AlertDescription>
            </Alert>
            <TextLink href="/staff/import">{tImports("unreadable.chooseAnother")}</TextLink>
          </>
        );
      case "matching":
        return <StaffMatchStep page={page} onMatched={() => undefined} />;
      case "checking":
        return (
          <>
            <PageHeader title={tImports("steps.check")} intro={t("checking", { name: page.fileName })} />
            <ImportProgress
              done={page.progress.rowsDone}
              total={page.progress.rowsTotal}
              since={null}
              label={t("checkingLabel")}
            />
          </>
        );
      case "checked":
        return changing ? (
          <StaffMatchStep
            page={page}
            onMatched={() => {
              setChanging(false);
            }}
            onBack={() => {
              setChanging(false);
            }}
          />
        ) : (
          <StaffCheckStep
            page={page}
            onChangeColumns={() => {
              setChanging(true);
            }}
          />
        );
      case "adding":
        return (
          <>
            <PageHeader title={t("adding.title")} intro={t("adding.intro", { name: page.fileName })} />
            <ImportProgress
              done={page.progress.rowsDone}
              total={page.progress.rowsToAdd}
              since={page.progress.addRequestedAt}
              label={t("adding.label")}
            />
          </>
        );
      case "done":
        return <PasswordsStep importId={importId} page={page} />;
      default:
        return <Ended page={page} />;
    }
  };

  return (
    <div ref={screen} className="flex max-w-[720px] flex-col gap-6">
      <p role="status" className="sr-only">
        {detail.data?.status === "done" ? t("done.title", { count: detail.data.progress.rowsAdded }) : ""}
      </p>
      <BackLink href={routes.staff} label={t("back")} />
      {detail.data ? (
        <>
          <ImportStepCaption status={detail.data.status} />
          {body(detail.data)}
        </>
      ) : detail.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={detail.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void detail.refetch()}
        />
      ) : (
        <LoadingRows rows={3} />
      )}
    </div>
  );
}
