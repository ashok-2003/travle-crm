"use client";

// A row's reason as a sentence (spec B24, B44), from imports.json's reasons, for both kinds' codes: "Same as row 12",
// "Already imported on 12 Oct".
import type { RowReason } from "@travel-crm/contracts/imports";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { formatDay } from "@/lib/format";

export function useRowReasonText(): (reason: RowReason) => string {
  const t = useTranslations("imports.reasons");
  return useCallback(
    (reason: RowReason) =>
      t(reason.code, {
        row: reason.row ?? "",
        // A calendar day, the same everywhere: shown at UTC's midnight in UTC.
        on: reason.on === undefined ? "" : formatDay(new Date(`${reason.on}T00:00:00Z`), { timeZone: "UTC" }),
      }),
    [t],
  );
}
