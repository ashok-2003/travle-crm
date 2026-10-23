// What an import's page shows (spec 3.2): its status and file, its columns and value matches, the defaults and
// choices, the preview's counts (one GROUP BY on import_row_by_plan), the same file imported before (B6), its progress
// and its report.
import {
  type GuessSource,
  type ImportCounts,
  type ImportDetail,
  type ImportField,
  type ImportKind,
  type RowOutcome,
  rowOutcomes,
  type RowPlan,
  rowPlans,
  type RowReasonCode,
  type ValueField,
  type ValueMatchedBy,
} from "@travel-crm/contracts/imports";
import { type OrgTx, sql, type Sql } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import { findImport } from "./batches.js";

const zeroFor = <Key extends string>(keys: readonly Key[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;

/** The import's rows by plan, outcome, first reason and whether a value went to the note: one GROUP BY. */
export function importCountsQuery(importId: string): Sql {
  return sql`
    SELECT plan, outcome, NULLIF(split_part(reasons[1], ':', 1), '') AS reason, noted, count(*)::int AS rows
    FROM import_row
    WHERE batch_id = ${importId}::uuid
    GROUP BY plan, outcome, reason, noted`;
}

/** What the check found and the add did, counted in one pass over the import's rows. */
export async function importCounts(
  tx: OrgTx,
  batch: Pick<ImportBatchRow, "id" | "rowsNewStage">,
): Promise<ImportCounts> {
  const groups = await tx.$queryRaw<
    { plan: RowPlan; outcome: RowOutcome | null; reason: RowReasonCode | null; noted: boolean; rows: number }[]
  >(importCountsQuery(batch.id));
  const byPlan = zeroFor(rowPlans);
  const outcomes = zeroFor(rowOutcomes);
  const notAdded = new Map<RowReasonCode, number>();
  const inCrm = { open: 0, closed: 0 };
  let noted = 0;
  for (const group of groups) {
    byPlan[group.plan] += group.rows;
    if (group.outcome !== null) outcomes[group.outcome] += group.rows;
    if (group.noted) noted += group.rows;
    if (group.plan === "not_added" && group.reason !== null) {
      notAdded.set(group.reason, (notAdded.get(group.reason) ?? 0) + group.rows);
    }
    if (group.plan === "in_crm") inCrm[group.reason === "in_crm_open" ? "open" : "closed"] += group.rows;
  }
  // Each destination once, whatever its case: the first spelling the file used.
  const destinations = await tx.$queryRaw<{ name: string }[]>`
    SELECT min(new_destination) AS name
    FROM import_row
    WHERE batch_id = ${batch.id}::uuid AND new_destination IS NOT NULL
    GROUP BY lower(new_destination)
    ORDER BY lower(new_destination)`;
  return {
    byPlan,
    returning: byPlan.returning,
    noted,
    newStage: batch.rowsNewStage,
    notAdded: [...notAdded].map(([reason, rows]) => ({ reason, rows })).sort((a, b) => b.rows - a.rows),
    inCrm,
    newDestinations: destinations.map((destination) => destination.name),
    outcomes,
  };
}

/** The agency's latest other import of this file that added rows (B6), or null. */
async function sameFileAs(tx: OrgTx, batch: ImportBatchRow): Promise<ImportDetail["sameFile"]> {
  if (batch.fileSha256 === null) return null;
  const earlier = await tx.importBatch.findFirst({
    where: {
      kind: batch.kind,
      fileSha256: Uint8Array.from(batch.fileSha256),
      id: { not: batch.id },
      rowsAdded: { gt: 0 },
    },
    orderBy: { id: "desc" },
    select: { createdAt: true, addRequestedAt: true, finishedAt: true, rowsAdded: true },
  });
  if (earlier === null) return null;
  const importedAt = earlier.finishedAt ?? earlier.addRequestedAt ?? earlier.createdAt;
  return { importedAt: importedAt.toISOString(), rowsAdded: earlier.rowsAdded };
}

export async function importDetail(
  tx: OrgTx,
  access: MemberAccess,
  kind: ImportKind,
  importId: string,
): Promise<ImportDetail> {
  const batch = await findImport(tx, access, kind, importId);
  const columns = await tx.importColumn.findMany({ where: { batchId: importId }, orderBy: { position: "asc" } });
  const valueMatches = await tx.importValueMatch.findMany({
    where: { batchId: importId },
    orderBy: [{ field: "asc" }, { value: "asc" }],
  });
  const report =
    batch.reportAttachmentId === null
      ? null
      : await tx.attachment.findUnique({
          where: { id: batch.reportAttachmentId },
          select: { fileName: true, sizeBytes: true },
        });
  return {
    id: batch.id,
    kind: batch.kind,
    status: batch.status,
    fileName: batch.fileName,
    fileKind: batch.fileKind,
    sheet: batch.sheetName === null ? null : { name: batch.sheetName, count: batch.sheetCount ?? 1 },
    unreadableReason: batch.unreadableReason,
    failureReason: batch.failureReason,
    sameFile: await sameFileAs(tx, batch),
    columns: columns.map((column) => ({
      position: column.position,
      header: column.header,
      samples: column.samples,
      // A column with values but none listed has more than 50 different ones (B11).
      values:
        column.samples.length === 0
          ? []
          : column.distinctValues.length === 0
            ? null
            : column.distinctValues.map((value, index) => ({ value, rows: column.distinctCounts[index] ?? 0 })),
      field: column.field as ImportField | null,
      guessedBy: column.guessedBy as GuessSource | null,
    })),
    valueMatches: valueMatches.map((match) => ({
      field: match.field as ValueField,
      value: match.value,
      target: match.target,
      matchedBy: match.matchedBy as ValueMatchedBy,
    })),
    defaults: {
      stage: batch.defaultStage,
      ownerUserId: batch.defaultOwnerUserId,
      budgetBasis: batch.budgetBasis,
      roleKey: batch.defaultRoleKey,
    },
    choices: {
      addBlocked: batch.addBlocked,
      addAlreadyImported: batch.addAlreadyImported,
      addInCrm: batch.addInCrm,
    },
    sourceSheet: batch.sourceSheetId === null ? null : { sheetId: batch.sourceSheetId },
    sourceMetaForm: batch.sourceMetaFormId === null ? null : { formId: batch.sourceMetaFormId },
    counts: batch.checkedAt === null ? null : await importCounts(tx, batch),
    progress: {
      rowsTotal: batch.rowsTotal,
      rowsToAdd: batch.rowsToAdd,
      rowsDone: batch.rowsDone,
      rowsAdded: batch.rowsAdded,
      addRequestedAt: batch.addRequestedAt?.toISOString() ?? null,
    },
    createdAt: batch.createdAt.toISOString(),
    checkedAt: batch.checkedAt?.toISOString() ?? null,
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    keepUntil: batch.keepUntil.toISOString(),
    report: report === null ? null : { fileName: report.fileName, sizeBytes: report.sizeBytes },
  };
}
