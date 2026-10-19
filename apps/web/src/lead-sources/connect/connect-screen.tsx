"use client";

// /settings/lead-sources/sheets/connect and /sheets/<sheetId>/connect (spec 6.5): connecting a sheet at whichever step
// its stored step says, so leaving and coming back finds it where it was: share and paste, the tab and columns, the rows
// already there, then "Reading your sheet…" until the worker has read it. Then to the sheet's page, or, for the second
// choice, to the import's preview. Each step swaps the screen, so the focus moves to the new step's heading.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { leadImportRoute, sheetRoute } from "@/lib/routes";
import { useLeadSheet } from "../use-lead-sheets";
import { ColumnsStep } from "./columns-step";
import { ExistingStep } from "./existing-step";
import { ReadingSheet } from "./reading-sheet";
import { ShareStep } from "./share-step";
import { connectStepOf } from "./use-connect-sheet";

export function ConnectScreen({ sheetId, matchingAgain = false }: { sheetId?: string; matchingAgain?: boolean }) {
  if (sheetId === undefined) return <ShareStep />;
  return <ConnectingSheet sheetId={sheetId} matchingAgain={matchingAgain} />;
}

function ConnectingSheet({ sheetId, matchingAgain }: { sheetId: string; matchingAgain: boolean }) {
  const t = useTranslations("sheets.connect");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const sheet = useLeadSheet(sheetId);
  const detail = sheet.data;
  const step = detail === undefined ? null : matchingAgain ? "columns" : connectStepOf(detail);

  useEffect(() => {
    if (detail === undefined || step !== "leave") return;
    router.replace(
      detail.existingRows === "check" && detail.existingImportId !== null
        ? leadImportRoute(detail.existingImportId)
        : sheetRoute(detail.id),
    );
  }, [detail, step, router]);

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
  switch (step) {
    case "columns":
      return (
        <FocusedStep stepKey="columns">
          <ColumnsStep detail={detail} matchingAgain={matchingAgain} />
        </FocusedStep>
      );
    case "existing":
      return (
        <FocusedStep stepKey="existing">
          <ExistingStep detail={detail} />
        </FocusedStep>
      );
    case "reading":
      return <ReadingSheet />;
    default:
      return <LoadingRows rows={2} shape="twoLines" />;
  }
}

/** The focus is left on a button that is gone when a step swaps the screen: it moves to the new step's heading. */
function FocusedStep({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = wrapper.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [stepKey]);
  return <div ref={wrapper}>{children}</div>;
}
