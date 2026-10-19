// An import's rows (spec B25-B27, B34): the check writes every row's plan, 1,000 to a transaction with its progress;
// the preview pages through examples by plan and reason; the add takes the next rows in row order and writes each
// one's outcome, moving the progress. A row with an outcome is never taken again (B27).
import {
  type ImportKind,
  type ImportRowsInput,
  type ImportRowsPage,
  type RowOutcome,
  type RowPlan,
  type RowReason,
} from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { ListenerContext } from "../jobs/index.js";
import { findImport, holdImport, moveImport } from "./batches.js";
import { decodeRowReason, encodeRowReason } from "./row-reasons.js";

/** What the check plans for one row. */
export interface ImportRowPlan {
  rowNumber: number;
  plan: RowPlan;
  reasons: readonly RowReason[];
  noted: boolean;
  newDestination: string | null;
  exampleName: string | null;
  exampleValue: string | null;
}

/** The longest example kept of a row's name and value (import_row_text_lengths). */
const MAX_EXAMPLE = 120;
const ROWS_PER_TRANSACTION = 1000;

/**
 * Replaces the import's rows with these plans, 1,000 to a transaction, each moving rows_done for the check's progress.
 * It writes only while the import is checking: a cancel or a new match stops it.
 */
export async function replaceImportRows(
  context: Pick<ListenerContext, "forOrg">,
  importId: string,
  rows: readonly ImportRowPlan[],
): Promise<void> {
  for (let start = 0; start === 0 || start < rows.length; start += ROWS_PER_TRANSACTION) {
    const chunk = rows.slice(start, start + ROWS_PER_TRANSACTION);
    const going = await context.forOrg(async (tx) => {
      if ((await holdImport(tx, importId))?.status !== "checking") return false;
      if (start === 0) await tx.importRow.deleteMany({ where: { batchId: importId } });
      await tx.importRow.createMany({
        data: chunk.map((row) => ({
          batchId: importId,
          rowNumber: row.rowNumber,
          plan: row.plan,
          reasons: row.reasons.map(encodeRowReason),
          noted: row.noted,
          newDestination: row.newDestination,
          exampleName: row.exampleName?.slice(0, MAX_EXAMPLE) ?? null,
          exampleValue: row.exampleValue?.slice(0, MAX_EXAMPLE) ?? null,
        })),
        // A run beside this one writes the same rows.
        skipDuplicates: true,
      });
      await tx.importBatch.update({ where: { id: importId }, data: { rowsDone: start + chunk.length } });
      return true;
    });
    if (!going) return;
  }
}

/** The check's end: the preview's numbers, and the import waits at checked. Nothing happens unless it was checking. */
export async function markImportChecked(
  tx: OrgTx,
  importId: string,
  summary: { rowsTotal: number; rowsToAdd: number; rowsNewStage: number },
  now: Date,
): Promise<void> {
  await moveImport(tx, importId, ["checking"], "checked", now, { ...summary, checkedAt: now });
}

/** A page of the import's rows with one plan, and one first reason when asked, by row number. */
export async function importRowsPage(
  tx: OrgTx,
  access: MemberAccess,
  kind: ImportKind,
  input: ImportRowsInput,
): Promise<ImportRowsPage> {
  await findImport(tx, access, kind, input.importId);
  const reason = input.reason ?? null;
  const rows = await tx.$queryRaw<
    { rowNumber: number; name: string | null; value: string | null; reasons: string[]; outcome: RowOutcome | null }[]
  >`
    SELECT row_number AS "rowNumber", example_name AS name, example_value AS value, reasons, outcome
    FROM import_row
    WHERE batch_id = ${input.importId}::uuid AND plan = ${input.plan}
      AND row_number > ${input.after ?? 0}
      AND (${reason}::text IS NULL OR split_part(reasons[1], ':', 1) = ${reason}::text)
    ORDER BY row_number
    LIMIT ${input.limit + 1}`;
  const items = rows.slice(0, input.limit).map((row) => ({ ...row, reasons: row.reasons.map(decodeRowReason) }));
  return { items, nextCursor: rows.length > input.limit ? (items.at(-1)?.rowNumber ?? null) : null };
}

/** Plans the add saves or leaves out; not_added rows are never saved. */
const addablePlans: readonly RowPlan[] = ["new", "returning", "enquiry", "blocked", "already_imported"];

/** The next rows the add takes: no outcome yet, a plan to add, in row order. */
export async function rowsToAdd(
  tx: OrgTx,
  importId: string,
  limit: number,
): Promise<{ rowNumber: number; plan: RowPlan }[]> {
  const rows = await tx.importRow.findMany({
    where: { batchId: importId, outcome: null, plan: { in: [...addablePlans] } },
    orderBy: { rowNumber: "asc" },
    take: limit,
    select: { rowNumber: true, plan: true },
  });
  return rows.map((row) => ({ rowNumber: row.rowNumber, plan: row.plan as RowPlan }));
}

/** What the add did with one row. */
export interface RowOutcomeRecord {
  rowNumber: number;
  outcome: RowOutcome;
  reasons?: readonly RowReason[];
  leadId?: string;
  personId?: string;
  memberId?: string;
  fingerprint?: Uint8Array;
}

/**
 * Writes each row's outcome, with what it became, clearing a staff row's password hash, and moves rows_done and
 * rows_added. A row that already has an outcome is left as it was.
 */
export async function recordRowOutcomes(
  tx: OrgTx,
  importId: string,
  outcomes: readonly RowOutcomeRecord[],
): Promise<void> {
  let done = 0;
  let added = 0;
  for (const record of outcomes) {
    const { count } = await tx.importRow.updateMany({
      where: { batchId: importId, rowNumber: record.rowNumber, outcome: null },
      data: {
        outcome: record.outcome,
        ...(record.reasons === undefined ? {} : { reasons: record.reasons.map(encodeRowReason) }),
        leadId: record.leadId ?? null,
        personId: record.personId ?? null,
        memberId: record.memberId ?? null,
        fingerprint: record.fingerprint === undefined ? null : Uint8Array.from(record.fingerprint),
        passwordHash: null,
      },
    });
    done += count;
    if (count === 1 && (record.outcome === "added" || record.outcome === "merged")) added += 1;
  }
  await tx.importBatch.update({
    where: { id: importId },
    data: { rowsDone: { increment: done }, rowsAdded: { increment: added } },
  });
}
