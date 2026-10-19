// Google's failures, as the refusals a person reads (S5). Each reason has its sentence in errors.json; the messages here
// hold the reason only, never a title, a link, an id or a cell.
import { GoogleSheetsError } from "@travel-crm/integrations/google-sheets";
import { DomainError } from "../kernel/index.js";

export const notSetUp = () =>
  new DomainError("CONFLICT", "SHEETS_NOT_SET_UP", "Google Sheets is not set up on this server");

/** The refusal for a failed call to Google; anything that is not Google's own error is passed on as it is. */
export function refusalFor(error: unknown): unknown {
  if (!(error instanceof GoogleSheetsError)) return error;
  switch (error.reason) {
    case "not_shared":
    case "not_found":
      return new DomainError("VALIDATION", "SHEET_NOT_SHARED", "The sheet can't be opened with the service account");
    case "not_a_sheet":
      return new DomainError("VALIDATION", "SHEET_NOT_GOOGLE_SHEET", "The file is not a Google Sheet");
    case "tab_missing":
      return new DomainError("CONFLICT", "SHEET_NOT_READY", "The sheet's tab is not there any more");
    case "rate_limited":
    case "unavailable":
    case "too_large":
      return new DomainError("CONFLICT", "SHEETS_UNAVAILABLE", "Google is not answering");
  }
}
