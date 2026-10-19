// The one reader of the two tables outside row-level security (ADR 0031): the check schedule, which lets the worker find
// due sheets of every organization without entering one, and the spreadsheet claim, which keeps a spreadsheet to one
// agency at a time. Both hold ids, times and a keyed hash only, and are reached in db.withoutOrg(). The ESLint raw-SQL
// guard allows their names in this file alone.
import { type Database, isUniqueViolation, type OrgTx } from "@travel-crm/db";
import { sheetSchedule, spreadsheetClaims } from "@travel-crm/db/sheet-schedule";
import type { Bytes } from "./hashes.js";

/** The agency holding a spreadsheet, or null when nobody does. */
export async function claimOf(
  db: Database,
  spreadsheetHash: Bytes,
): Promise<{ id: string; organizationId: string } | null> {
  return db.withoutOrg((tx) =>
    spreadsheetClaims(tx).findUnique({ where: { spreadsheetHash }, select: { id: true, organizationId: true } }),
  );
}

/** Records the claim; false when another claim for the spreadsheet exists (a unique violation, S4's lost race). */
export async function insertClaim(
  db: Database,
  input: { organizationId: string; spreadsheetHash: Bytes; now: Date },
): Promise<{ id: string } | null> {
  try {
    return await db.withoutOrg((tx) =>
      spreadsheetClaims(tx).create({
        data: { organizationId: input.organizationId, spreadsheetHash: input.spreadsheetHash, createdAt: input.now },
        select: { id: true },
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Deletes the claim of the agency, by id. */
export async function deleteClaim(db: Database, organizationId: string, claimId: string): Promise<void> {
  await db.withoutOrg((tx) => spreadsheetClaims(tx).deleteMany({ where: { id: claimId, organizationId } }));
}

/** How many schedule rows there are, for a test or a check of the exemption. */
export function scheduleRowCount(db: Database): Promise<number> {
  return db.withoutOrg((tx) => sheetSchedule(tx).count());
}

export interface ScheduleRow {
  sheetId: string;
  organizationId: string;
  serviceAccountIndex: number;
  nextCheckAt: Date;
}

/** A connection's schedule row, made when it has none (due at `nextCheckAt`) and otherwise kept as it is (S36). */
export async function upsertScheduleRow(db: Database, row: ScheduleRow): Promise<void> {
  await db.withoutOrg(async (tx) => {
    await sheetSchedule(tx).upsert({
      where: { id: row.sheetId },
      create: {
        id: row.sheetId,
        organizationId: row.organizationId,
        serviceAccountIndex: row.serviceAccountIndex,
        nextCheckAt: row.nextCheckAt,
      },
      update: { serviceAccountIndex: row.serviceAccountIndex },
    });
  });
}

/** Removes the connection's schedule row; nothing when it has none. */
export async function removeScheduleRow(db: Database, sheetId: string): Promise<void> {
  await db.withoutOrg((tx) => sheetSchedule(tx).deleteMany({ where: { id: sheetId } }));
}

/** The connection's schedule row, for a test. */
export function scheduleRowOf(db: Database, sheetId: string) {
  return db.withoutOrg((tx) => sheetSchedule(tx).findUnique({ where: { id: sheetId } }));
}

/**
 * S36: the most overdue sheets of one service account that are due and not claimed (SKIP LOCKED, so two dispatchers get
 * disjoint sets), at most `limit`, each held for `claimSeconds` so a sheet already queued is not queued again.
 */
export async function claimDueSheets(
  db: Database,
  input: { now: Date; accountIndex: number; limit: number; claimSeconds: number },
): Promise<{ sheetId: string; organizationId: string }[]> {
  const until = new Date(input.now.getTime() + input.claimSeconds * 1000);
  return db.withoutOrg(async (tx) => {
    const due = await tx.$queryRaw<{ id: string; organizationId: string }[]>`
      SELECT id, organization_id AS "organizationId"
      FROM sheet_check_schedule
      WHERE next_check_at <= ${input.now}
        AND (claimed_until IS NULL OR claimed_until < ${input.now})
        AND service_account_index = ${input.accountIndex}
      ORDER BY next_check_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${input.limit}`;
    if (due.length > 0) {
      await tx.$executeRaw`
        UPDATE sheet_check_schedule SET claimed_until = ${until} WHERE id = ANY(${due.map((row) => row.id)}::uuid[])`;
    }
    return due.map((row) => ({ sheetId: row.id, organizationId: row.organizationId }));
  });
}

/** A check's end (S19): the next time it is due and its claim released, or, with null, the row removed. */
export async function finishScheduledCheck(
  db: Database,
  input: { sheetId: string; nextCheckAt: Date | null },
): Promise<void> {
  if (input.nextCheckAt === null) return removeScheduleRow(db, input.sheetId);
  const { nextCheckAt } = input;
  await db.withoutOrg((tx) =>
    sheetSchedule(tx).updateMany({
      where: { id: input.sheetId },
      data: { nextCheckAt, claimedUntil: null },
    }),
  );
}

/** Schedule rows of connections that are not checked any more (the sweep): none live, so none needed. */
export async function dropStaleScheduleRows(tx: OrgTx): Promise<number> {
  return tx.$executeRaw`
    DELETE FROM sheet_check_schedule s
    WHERE NOT EXISTS (
      SELECT 1 FROM sheet_connection c
      WHERE c.id = s.id AND c.status IN ('running', 'lost_access', 'tab_missing', 'columns_missing', 'needs_manager'))`;
}

/** Claims no live connection holds, made before `before`: an hour old at least, so a connect in progress keeps its own. */
export async function dropUnusedClaims(tx: OrgTx, before: Date): Promise<number> {
  return tx.$executeRaw`
    DELETE FROM sheet_spreadsheet_claim k
    WHERE k.created_at < ${before}
      AND NOT EXISTS (
        SELECT 1 FROM sheet_connection c WHERE c.claim_id = k.id AND c.status <> 'disconnected')`;
}
