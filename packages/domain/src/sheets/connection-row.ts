// A sheet_connection row as the module reads it, every fixed value typed by its contract's list (the table's CHECKs hold
// the same lists), and the one way to find a sheet of the signed-in agency.
import type { ExistingRowChoice, SheetStatus, SheetStep } from "@travel-crm/contracts/sheets";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export interface SheetConnectionRow {
  organizationId: string;
  id: string;
  status: SheetStatus;
  step: SheetStep;
  existingRows: ExistingRowChoice | null;
  spreadsheetId: string;
  tabGid: string;
  tabTitle: string;
  sheetTitle: string;
  sheetLocale: string;
  sheetTimeZone: string;
  serviceAccountIndex: number;
  serviceAccountEmail: string | null;
  cursorRow: number;
  rowsSeen: number;
  headerHash: Uint8Array | null;
  connectedBy: string;
  impersonatedBy: string | null;
  claimId: string | null;
  rowsAdded: number;
  rowsMerged: number;
  rowsDuplicate: number;
  consecutiveFailures: number;
  attentionSince: Date | null;
  lastCheckedAt: Date | null;
  lastOkAt: Date | null;
  lastFullReadAt: Date | null;
  checkStartedAt: Date | null;
  holdUntil: Date | null;
  createdAt: Date;
  touchedAt: Date;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

type StoredConnection = NonNullable<Awaited<ReturnType<OrgTx["sheetConnection"]["findFirst"]>>>;

export function toConnectionRow(row: StoredConnection): SheetConnectionRow {
  return {
    ...row,
    status: row.status as SheetStatus,
    step: row.step as SheetStep,
    existingRows: row.existingRows as ExistingRowChoice | null,
  };
}

export const sheetNotFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");

export const sheetNotReady = () =>
  new DomainError("CONFLICT", "SHEET_NOT_READY", "This sheet is at another step than the one asked for");

/** The agency's sheet, not disconnected; another agency's, a missing one and a disconnected one are not found. */
export async function findSheet(tx: OrgTx, sheetId: string): Promise<SheetConnectionRow> {
  const row = await tx.sheetConnection.findFirst({ where: { id: sheetId, status: { not: "disconnected" } } });
  if (row === null) throw sheetNotFound();
  return toConnectionRow(row);
}

/** The sheet as it stands, disconnected or not, for a job's first look; null when there is none. */
export async function sheetOf(tx: OrgTx, sheetId: string): Promise<SheetConnectionRow | null> {
  const row = await tx.sheetConnection.findUnique({ where: { id: sheetId } });
  return row === null ? null : toConnectionRow(row);
}

/**
 * The sheet's row, locked until the transaction ends, so two runs of one step take turns (S25). FOR NO KEY UPDATE, not
 * FOR UPDATE: a row of the ledger inserted meanwhile key-shares the connection, and needn't wait.
 */
export async function holdSheet(tx: OrgTx, sheetId: string): Promise<SheetConnectionRow | null> {
  await tx.$queryRaw`SELECT id FROM sheet_connection WHERE id = ${sheetId}::uuid FOR NO KEY UPDATE`;
  return sheetOf(tx, sheetId);
}
