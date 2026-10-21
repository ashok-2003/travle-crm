"use client";

// What the connect screens share: which screen a sheet's stored step means, and the words "Step n of 3" around it (S5-S14).
import type { SheetDetail } from "@travel-crm/contracts/sheets";

export type ConnectStep = "columns" | "existing" | "reading" | "leave";

/**
 * The screen a sheet is at. Its tab and its columns are one screen; once it is connected (or on its way to its
 * connect-time import) there is nothing left to do here: the person is taken to the sheet's own page, or the import's.
 */
export function connectStepOf(detail: SheetDetail): ConnectStep {
  if (detail.status !== "connecting") return "leave";
  if (detail.step === "existing") return "existing";
  if (detail.step === "done")
    return detail.existingRows === "check" && detail.existingImportId !== null ? "leave" : "reading";
  return "columns";
}

/** The step's number in "Step 2 of 3". */
export const stepNumbers = { share: 1, columns: 2, existing: 3 } as const;
