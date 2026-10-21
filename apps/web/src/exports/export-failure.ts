"use client";

// Why an export failed (B37, B41), or that its file is gone (B54), as one sentence for the dialog and the page alike.
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { useTranslations } from "next-intl";

/** What the rows are called: a lead export's leads, a staff export's people. */
export type RowsWord = "leads" | "people";

export const rowsWordOf = (kind: ExportDetail["kind"]): RowsWord => (kind === "leads" ? "leads" : "people");

export function useExportFailure(): (detail: ExportDetail | undefined) => string | null {
  const t = useTranslations("exports");
  return (detail) => {
    if (detail?.status === "expired") return t("page.deleted");
    if (detail?.status !== "failed") return null;
    if (detail.failureReason === null) return t("failures.other");
    if (detail.failureReason === "too_many_rows") return t(`failures.too_many_rows.${rowsWordOf(detail.kind)}`);
    return t(`failures.${detail.failureReason}`);
  };
}
