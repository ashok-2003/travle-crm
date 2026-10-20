// "Check the sheet" (S5): the first step of connecting. One describe of the pasted sheet; if Google opens it, the claim
// on the spreadsheet is taken and a draft connection is made under the agency's limit, with the tab's headers as its
// columns. Each way it can fail has its own reason.
import { type Database, isUniqueViolation } from "@travel-crm/db";
import { GoogleSheetsError, type GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { isOnDemoPlan } from "../subscriptions/index.js";
import type { ParsedSheetLink } from "@travel-crm/contracts/sheets";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, newUuidV7 } from "../kernel/index.js";
import type { SheetsDependencies } from "./dependencies.js";
import { notSetUp, refusalFor } from "./google-refusals.js";
import { accountIndexFor } from "./hashes.js";
import { nameColumns } from "./header-keys.js";
import { maxSheetColumns, sheetLimitFor } from "./limits.js";
import { assertNotClaimedElsewhere, releaseClaimIfUnused, takeSpreadsheetClaim } from "./claim.js";

const empty = () => new DomainError("VALIDATION", "SHEET_EMPTY", "The first row of this tab is empty");

/**
 * Opens the sheet with the account its id hashes to, then with the others if that one isn't shared with it: the agency
 * shared it with an address we showed, and with more than one account any of them may be the one it chose.
 */
async function describeOnAnyAccount(google: GoogleSheets, sheetId: string, input: ParsedSheetLink) {
  const count = Math.max(google.accounts().length, 1);
  const first = accountIndexFor(sheetId, count);
  let refused: unknown = null;
  for (let tried = 0; tried < count; tried += 1) {
    const serviceAccountIndex = (first + tried) % count;
    try {
      const description = await google.describe(
        serviceAccountIndex,
        input.spreadsheetId,
        input.gid === null ? {} : { tabGid: input.gid },
      );
      return { description, serviceAccountIndex };
    } catch (error) {
      refused = refusalFor(error);
      const notShared = error instanceof GoogleSheetsError && ["not_shared", "not_found"].includes(error.reason);
      if (!notShared) throw refused;
    }
  }
  throw refused;
}

/** A new draft's tab, title and headers, as Google described the sheet. */
export async function beginSheet(
  db: Database,
  dependencies: SheetsDependencies,
  access: MemberAccess,
  input: ParsedSheetLink,
  now: Date,
): Promise<{ sheetId: string }> {
  const { google, hashes } = dependencies;
  if (google === null || hashes === null) throw notSetUp();
  // The shared demo only shows the product: it never reads a real agency's sheet (spec 10).
  if (await db.forOrg(access.organizationId, (tx) => isOnDemoPlan(tx, access.organizationId))) {
    throw new DomainError("CONFLICT", "SHEETS_NOT_IN_DEMO", "Google Sheets is not available in the demo");
  }
  const sheetId = newUuidV7();
  // A spreadsheet another agency holds is refused before Google is asked, so it says nothing of whether it is shared (SD7).
  const spreadsheetHash = hashes.spreadsheetHash(input.spreadsheetId);
  await assertNotClaimedElsewhere(db, access.organizationId, spreadsheetHash);
  // Outside any transaction: a request to Google must not hold a database connection.
  const { description, serviceAccountIndex } = await describeOnAnyAccount(google, sheetId, input);
  const tab = description.chosenTab;
  if (tab === null || description.header.every((cell) => cell.trim() === "")) throw empty();

  const { claimId, created } = await takeSpreadsheetClaim(db, access.organizationId, spreadsheetHash, now);
  try {
    await db.forOrg(access.organizationId, async (tx) => {
      // The agency's count and its inserts take turns: two people connecting at once can't both take the last place.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sheet-limit:${access.organizationId}`}, 0))`;
      const live = await tx.sheetConnection.findMany({
        where: { status: { not: "disconnected" } },
        select: { spreadsheetId: true, tabGid: true },
      });
      if (live.some((sheet) => sheet.spreadsheetId === input.spreadsheetId && sheet.tabGid === tab.gid)) {
        throw new DomainError("CONFLICT", "SHEET_ALREADY_CONNECTED", "This sheet is already connected here");
      }
      if (live.length >= (await sheetLimitFor(access.organizationId))) {
        throw new DomainError(
          "LIMIT_REACHED",
          "SHEET_LIMIT_REACHED",
          "This organization has the most sheets it may connect",
        );
      }
      await tx.sheetConnection.create({
        data: {
          id: sheetId,
          status: "connecting",
          step: "tab",
          spreadsheetId: input.spreadsheetId,
          tabGid: tab.gid,
          tabTitle: tab.title.slice(0, 100),
          sheetTitle: description.title.slice(0, 200),
          sheetLocale: description.locale.slice(0, 20),
          sheetTimeZone: description.timeZone.slice(0, 64),
          serviceAccountIndex,
          connectedBy: access.userId,
          impersonatedBy: access.impersonatedBy,
          claimId,
          createdAt: now,
          touchedAt: now,
        },
      });
      await tx.sheetColumn.createMany({
        data: nameColumns(description.header.slice(0, maxSheetColumns)).map(({ header, key }) => ({
          connectionId: sheetId,
          headerKey: key,
          header,
        })),
      });
    });
  } catch (error) {
    // A claim this call made goes back; one the agency already held (another tab of the sheet) stays.
    if (created) await releaseClaimIfUnused(db, access.organizationId, claimId);
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "SHEET_ALREADY_CONNECTED", "This sheet is already connected here");
    }
    throw error;
  }
  // Another tab's disconnect may have let the claim go between taking it and this draft (SD6): take it again now the draft
  // is there. Another agency may hold it by now: then the draft goes and the refusal is the generic one.
  try {
    const again = await takeSpreadsheetClaim(db, access.organizationId, spreadsheetHash, now);
    if (again.claimId !== claimId) {
      await db.forOrg(access.organizationId, (tx) =>
        tx.sheetConnection.update({ where: { id: sheetId }, data: { claimId: again.claimId } }),
      );
    }
  } catch (error) {
    await db.forOrg(access.organizationId, async (tx) => {
      await tx.sheetColumn.deleteMany({ where: { connectionId: sheetId } });
      // The runtime role never deletes a connection: the draft is let go as a disconnected one, which frees its place.
      await tx.sheetConnection.update({
        where: { id: sheetId },
        data: { status: "disconnected", disconnectedAt: now, claimId: null },
      });
    });
    throw error;
  }
  return { sheetId };
}
