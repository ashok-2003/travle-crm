// What the sheets module's steps are built from: the Google port (null when no service account is set: Google Sheets is
// off) and the hashes (null when SHEETS_HASH_KEY is not set).
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import type { SheetsHashes } from "./hashes.js";

export interface SheetsDependencies {
  google: GoogleSheets | null;
  hashes: SheetsHashes | null;
}
