// Batches and rows for other tests' setup, written straight into the tables with no rule, audit entry or event: an
// import of leads waiting at its preview unless told otherwise, and a row the check planned as new. A test of a rule
// calls the module's own function instead.
import type { OrgTx } from "@travel-crm/db";

export interface BatchSeed {
  startedBy: string;
  kind?: "leads" | "staff";
  status?: string;
  fileName?: string;
  fileKind?: "csv" | "xlsx";
  fileAttachmentId?: string | null;
  fileSha256?: Uint8Array<ArrayBuffer> | null;
  sheetName?: string | null;
  sheetCount?: number | null;
  unreadableReason?: string | null;
  failureReason?: string | null;
  rowsTotal?: number;
  rowsToAdd?: number;
  rowsDone?: number;
  rowsAdded?: number;
  rowsNewStage?: number;
  defaultStage?: string;
  defaultOwnerUserId?: string | null;
  budgetBasis?: string | null;
  defaultRoleKey?: string | null;
  addBlocked?: boolean;
  addAlreadyImported?: boolean;
  stopRequested?: boolean;
  reportAttachmentId?: string | null;
  impersonatedBy?: string | null;
  createdAt?: Date;
  checkedAt?: Date | null;
  addRequestedAt?: Date | null;
  finishedAt?: Date | null;
  keepUntil?: Date;
}

/** An import of leads, checked and waiting for Add, started by `startedBy`. */
export async function aBatch(tx: OrgTx, seed: BatchSeed): Promise<{ id: string }> {
  return tx.importBatch.create({
    data: {
      kind: "leads",
      status: "checked",
      fileName: "enquiries-oct-2026.csv",
      fileKind: "csv",
      checkedAt: new Date(),
      keepUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...seed,
    },
    select: { id: true },
  });
}

export interface RowSeed {
  batchId: string;
  rowNumber: number;
  plan?: string;
  reasons?: string[];
  noted?: boolean;
  newDestination?: string | null;
  outcome?: string | null;
  leadId?: string | null;
  personId?: string | null;
  memberId?: string | null;
  fingerprint?: Uint8Array<ArrayBuffer> | null;
  passwordHash?: string | null;
  exampleName?: string | null;
  exampleValue?: string | null;
}

/** One row of the batch, planned as new unless told otherwise. */
export async function aRow(tx: OrgTx, seed: RowSeed): Promise<{ id: string }> {
  return tx.importRow.create({ data: { plan: "new", ...seed }, select: { id: true } });
}
