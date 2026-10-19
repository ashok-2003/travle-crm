// The one reader of the two tables outside row-level security (ADR 0031): the check schedule, which lets the worker find
// due sheets of every organization without entering one, and the spreadsheet claim, which keeps a spreadsheet to one
// agency at a time. Both hold ids, times and a keyed hash only, and are reached in db.withoutOrg(). The ESLint raw-SQL
// guard allows their names in this file alone.
import { type Database, isUniqueViolation } from "@travel-crm/db";
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
