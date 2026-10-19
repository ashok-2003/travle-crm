// An import_batch row as the module reads it, every fixed value typed by its contract's list (the table's CHECKs hold
// the same lists).
import type { BudgetBasis, LeadImportStage } from "@travel-crm/contracts/crm";
import type { ImportFailureReason, ImportKind, ImportStatus, UnreadableReason } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";

export interface ImportBatchRow {
  organizationId: string;
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  fileAttachmentId: string | null;
  fileName: string;
  fileKind: "csv" | "xlsx";
  fileSha256: Uint8Array | null;
  sheetName: string | null;
  sheetCount: number | null;
  unreadableReason: UnreadableReason | null;
  failureReason: ImportFailureReason | null;
  rowsTotal: number;
  rowsToAdd: number;
  rowsDone: number;
  rowsAdded: number;
  rowsNewStage: number;
  defaultStage: LeadImportStage;
  defaultOwnerUserId: string | null;
  budgetBasis: BudgetBasis | null;
  defaultRoleKey: string | null;
  addBlocked: boolean;
  addAlreadyImported: boolean;
  /** Whether the add takes rows planned in_crm: a sheet's import asks (the Sheets sync). */
  addInCrm: boolean;
  stopRequested: boolean;
  reportAttachmentId: string | null;
  startedBy: string;
  impersonatedBy: string | null;
  /** The Google Sheet connection the import reads, or null for a file. */
  sourceSheetId: string | null;
  createdAt: Date;
  checkedAt: Date | null;
  addRequestedAt: Date | null;
  finishedAt: Date | null;
  keepUntil: Date;
}

type StoredBatch = NonNullable<Awaited<ReturnType<OrgTx["importBatch"]["findFirst"]>>>;

export function toBatchRow(row: StoredBatch): ImportBatchRow {
  return {
    ...row,
    kind: row.kind as ImportKind,
    status: row.status as ImportStatus,
    fileKind: row.fileKind as "csv" | "xlsx",
    unreadableReason: row.unreadableReason as UnreadableReason | null,
    failureReason: row.failureReason as ImportFailureReason | null,
    defaultStage: row.defaultStage as LeadImportStage,
    budgetBasis: row.budgetBasis as BudgetBasis | null,
  };
}
