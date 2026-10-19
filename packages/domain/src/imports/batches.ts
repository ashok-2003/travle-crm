// Finding an import and keeping it: an import is its starter's alone (D6), held in turn by the jobs that work on it,
// kept a week from its last change (D5, B53), and listed among its starter's last ten.
import type { ImportKind, ImportStatus, RecentImport } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { type ImportBatchRow, toBatchRow } from "./batch-row.js";

/** How long an import's file, report and kept values stay after its last change (B53). */
export const IMPORT_KEPT_MS = 7 * 24 * 60 * 60 * 1000;

export const keepUntilFrom = (now: Date) => new Date(now.getTime() + IMPORT_KEPT_MS);

export const notReady = () =>
  new DomainError("CONFLICT", "IMPORT_NOT_READY", "This import is at another step than the one asked for");

/** The person's own import of this kind; another person's, kind's or organization's is not found (D6). */
export async function findImport(
  tx: OrgTx,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
): Promise<ImportBatchRow> {
  const row = await tx.importBatch.findFirst({ where: { id: importId, kind, startedBy: access.userId } });
  if (!row) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such import");
  return toBatchRow(row);
}

/** The import's row, locked (FOR UPDATE) until the transaction ends, so two runs of one step take turns (B26). */
export async function holdImport(tx: OrgTx, importId: string): Promise<ImportBatchRow | null> {
  await tx.$queryRaw`SELECT id FROM import_batch WHERE id = ${importId}::uuid FOR UPDATE`;
  const row = await tx.importBatch.findUnique({ where: { id: importId } });
  return row === null ? null : toBatchRow(row);
}

/**
 * Moves the import from one of `from` to `to`, keeping it a week from now, with any other columns the step sets.
 * Returns false when it was no longer at one of `from` (another request or job moved it first).
 */
export async function moveImport(
  tx: OrgTx,
  importId: string,
  from: readonly ImportStatus[],
  to: ImportStatus,
  now: Date,
  data: Parameters<OrgTx["importBatch"]["updateMany"]>[0]["data"] = {},
): Promise<boolean> {
  const { count } = await tx.importBatch.updateMany({
    where: { id: importId, status: { in: [...from] } },
    data: { ...data, status: to, keepUntil: keepUntilFrom(now) },
  });
  return count === 1;
}

/** The person's last ten imports of the kind, newest first (Recent imports). */
export async function recentImports(tx: OrgTx, access: MemberAccess, kind: ImportKind): Promise<RecentImport[]> {
  const rows = await tx.importBatch.findMany({
    where: { kind, startedBy: access.userId },
    orderBy: { id: "desc" },
    take: 10,
    select: { id: true, fileName: true, createdAt: true, status: true, rowsTotal: true, rowsAdded: true },
  });
  return rows.map((row) => ({
    ...row,
    status: row.status as ImportStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}
