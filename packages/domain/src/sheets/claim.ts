// The spreadsheet claim (S4): a spreadsheet is connected to one agency at a time, by the keyed hash of its id, unique
// across all agencies. A second agency finds it taken and is refused with one generic sentence that says nothing of who,
// when or what. The agency's own second tab of the same spreadsheet finds the claim already theirs.
import type { Database } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import type { Bytes } from "./hashes.js";
import { claimById, claimOf, deleteClaim, insertClaim } from "./schedule.js";

const claimedElsewhere = () =>
  new DomainError("CONFLICT", "SHEET_CLAIMED_ELSEWHERE", "This sheet is already connected elsewhere");

/**
 * Takes the claim for the agency. `created` is false when the agency already held it (another tab of the spreadsheet),
 * so a refusal later in the same step releases only a claim this call made. A lost race is the same refusal.
 */
export async function takeSpreadsheetClaim(
  db: Database,
  organizationId: string,
  spreadsheetHash: Bytes,
  now: Date,
): Promise<{ claimId: string; created: boolean }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const held = await claimOf(db, spreadsheetHash);
    if (held !== null) {
      if (held.organizationId !== organizationId) throw claimedElsewhere();
      return { claimId: held.id, created: false };
    }
    const made = await insertClaim(db, { organizationId, spreadsheetHash, now });
    if (made !== null) return { claimId: made.id, created: true };
    // Someone claimed it between the look and the insert: look again, whose claim it is.
  }
  throw claimedElsewhere();
}

/**
 * Releases the claim when no live connection of the agency holds it (the last tab of the spreadsheet was disconnected,
 * or the draft deleted). True when it was released.
 */
export async function releaseClaimIfUnused(db: Database, organizationId: string, claimId: string): Promise<boolean> {
  const holders = () =>
    db.forOrg(organizationId, (tx) =>
      tx.sheetConnection.count({ where: { claimId, status: { not: "disconnected" } } }),
    );
  if ((await holders()) > 0) return false;
  const claim = await claimById(db, organizationId, claimId);
  await deleteClaim(db, organizationId, claimId);
  // A connection made while the claim was let go holds it again: the claim goes back for it (SD6), with its new id.
  if (claim !== null && (await holders()) > 0) {
    const back = await insertClaim(db, { organizationId, spreadsheetHash: claim.spreadsheetHash, now: new Date() });
    if (back !== null) {
      await db.forOrg(organizationId, (tx) =>
        tx.sheetConnection.updateMany({
          where: { claimId, status: { not: "disconnected" } },
          data: { claimId: back.id },
        }),
      );
    }
    return false;
  }
  return true;
}

/** Refuses with the one generic sentence, before Google is asked, when another agency holds the spreadsheet (SD7). */
export async function assertNotClaimedElsewhere(
  db: Database,
  organizationId: string,
  spreadsheetHash: Bytes,
): Promise<void> {
  const held = await claimOf(db, spreadsheetHash);
  if (held !== null && held.organizationId !== organizationId) throw claimedElsewhere();
}

/**
 * M8: a draft whose claim is gone (the release and a new connection crossed, or the repair after a release failed) takes
 * the claim again before it is confirmed. Another agency may hold the spreadsheet by now: then the refusal is the generic one.
 */
export async function repairClaim(
  db: Database,
  hashes: { spreadsheetHash(spreadsheetId: string): Bytes },
  organizationId: string,
  sheet: { id: string; spreadsheetId: string; claimId: string | null },
  now: Date,
): Promise<void> {
  if (sheet.claimId !== null && (await claimById(db, organizationId, sheet.claimId)) !== null) return;
  const { claimId } = await takeSpreadsheetClaim(db, organizationId, hashes.spreadsheetHash(sheet.spreadsheetId), now);
  await db.forOrg(organizationId, (tx) => tx.sheetConnection.update({ where: { id: sheet.id }, data: { claimId } }));
}
