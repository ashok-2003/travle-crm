// Which service account a sheet is read with (SC9, M3): the one whose address it was shared with, found in the list as it
// is now, so a list that was reordered cannot send a sheet to the wrong account. A sheet from before the address was kept
// has only its place in the list. An address no longer in the list is an account taken out: nothing can open the sheet.
import { GoogleSheetsError, type GoogleSheets } from "@travel-crm/integrations/google-sheets";
import type { SheetConnectionRow } from "./connection-row.js";

type WithAccount = Pick<SheetConnectionRow, "serviceAccountIndex" | "serviceAccountEmail">;

export function accountIndexOf(google: Pick<GoogleSheets, "accounts"> | null, sheet: WithAccount): number {
  if (google === null || sheet.serviceAccountEmail === null) return sheet.serviceAccountIndex;
  const found = google.accounts().find((account) => account.email === sheet.serviceAccountEmail);
  if (found === undefined) throw new GoogleSheetsError("unavailable");
  return found.index;
}

/** The address the agency shared the sheet with, for the words that tell them to share it again. */
export function accountAddressOf(google: Pick<GoogleSheets, "accounts"> | null, sheet: WithAccount): string | null {
  return sheet.serviceAccountEmail ?? google?.accounts()[sheet.serviceAccountIndex]?.email ?? null;
}
