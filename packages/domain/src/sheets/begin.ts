// "Check the sheet" (S5): the first step of connecting. One describe of the pasted sheet; if Google opens it, the claim
// on the spreadsheet is taken and a draft connection is made under the agency's limit, with the tab's headers as its
// columns. Each way it can fail has its own reason.
import { type Database, isUniqueViolation } from "@travel-crm/db";
import { isOnDemoPlan } from "../subscriptions/index.js";
import type { ParsedSheetLink } from "@travel-crm/contracts/sheets";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, newUuidV7 } from "../kernel/index.js";
import type { SheetsDependencies } from "./dependencies.js";
import { notSetUp, refusalFor } from "./google-refusals.js";
import { accountIndexFor } from "./hashes.js";
import { nameColumns } from "./header-keys.js";
import { maxSheetColumns, sheetLimitFor } from "./limits.js";
import { releaseClaimIfUnused, takeSpreadsheetClaim } from "./claim.js";

const empty = () => new DomainError("VALIDATION", "SHEET_EMPTY", "The first row of this tab is empty");

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
  const serviceAccountIndex = accountIndexFor(sheetId, Math.max(google.accounts().length, 1));
  // Outside any transaction: a request to Google must not hold a database connection.
  const description = await google
    .describe(serviceAccountIndex, input.spreadsheetId, input.gid === null ? {} : { tabGid: input.gid })
    .catch((error: unknown) => {
      throw refusalFor(error);
    });
  const tab = description.chosenTab;
  if (tab === null || description.header.every((cell) => cell.trim() === "")) throw empty();

  const { claimId, created } = await takeSpreadsheetClaim(
    db,
    access.organizationId,
    hashes.spreadsheetHash(input.spreadsheetId),
    now,
  );
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
  return { sheetId };
}
