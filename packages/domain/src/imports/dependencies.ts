// What the imports module's listeners are built from: the files and spreadsheets ports, identity's people and roles,
// the subscription (may the agency still change things?) and the plan's seats.
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { Files } from "../files/index.js";
import type { Identity, SeatLimit } from "../identity/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";

/**
 * The parts of identity an import needs: the importer's access afresh, the lead workers, the agency's staff, and its
 * people and roles matched to a file's words.
 */
export type ImportIdentity = Pick<
  Identity,
  "resolveAccess" | "firstOwner" | "leadWorkers" | "staff" | "matchLeadWorkers" | "matchRoles"
>;

export interface ImportJobDependencies {
  files: Files;
  spreadsheets: Spreadsheets;
  identity: ImportIdentity;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  seatLimit: SeatLimit;
  /**
   * Where a Google Sheet's rows came from, for an import that reads a sheet (the Sheets sync, N6): its source detail,
   * time zone and date locale. Null when the connection is gone. A file import never asks.
   */
  sheetOrigin?: (tx: OrgTx, sheetId: string) => Promise<SheetOrigin | null>;
  /**
   * The fingerprints (hex, with when) that the Google Sheets' ledgers hold among these, so a file holding a row a sheet
   * already added reads it as "already imported" (SD15). A function handed in: imports never calls sheets.
   */
  sheetFingerprints?: (tx: OrgTx, fingerprints: readonly Uint8Array[]) => Promise<Map<string, Date>>;
  /**
   * The `${kind}:${value}` of each of these contacts that is an erased customer's, so a Google Sheet's import leaves
   * their row out when the erasure came after the sheet's baseline (M6). A function handed in: imports never calls sheets.
   */
  sheetErasedContacts?: (
    tx: OrgTx,
    contacts: readonly { kind: "phone" | "email" | "instagram"; value: string }[],
  ) => Promise<Set<string>>;
}
