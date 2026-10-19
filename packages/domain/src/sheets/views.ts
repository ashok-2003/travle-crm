// What the sheets' screens read (spec 3.1, 3.4): the list of connected sheets, and one sheet's page, from the connection's
// counters, its columns and the partial indexes, never from Google. Names and the service account's address come in from
// the caller: other modules own them.
import type { AttentionState, SheetDetail, SheetListItem } from "@travel-crm/contracts/sheets";
import type { OrgTx } from "@travel-crm/db";
import { findSheet } from "./connection-row.js";
import { claimSeconds, lateAfterMinutes, maxSheetRows } from "./limits.js";

const attentionStates: ReadonlySet<string> = new Set([
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);
const attentionOf = (status: string): AttentionState | null =>
  attentionStates.has(status) ? (status as AttentionState) : null;

/** The agency's connected sheets and drafts, newest first (they count toward its limit). */
export async function listSheets(tx: OrgTx): Promise<SheetListItem[]> {
  const sheets = await tx.sheetConnection.findMany({
    where: { status: { not: "disconnected" } },
    orderBy: { id: "desc" },
    select: { id: true, sheetTitle: true, tabTitle: true, status: true, lastCheckedAt: true },
  });
  return sheets.map((sheet) => ({
    id: sheet.id,
    sheetTitle: sheet.sheetTitle,
    tabTitle: sheet.tabTitle,
    status: sheet.status as SheetListItem["status"],
    attentionState: attentionOf(sheet.status),
    lastCheckedAt: sheet.lastCheckedAt?.toISOString() ?? null,
  }));
}

export interface SheetDetailFacts {
  /** The address the agency shared the sheet with. */
  serviceAccountEmail: string;
  connectedByName: string | null;
  defaultOwnerName: string | null;
  /** The agency can't change anything today. */
  readOnly: boolean;
}

/** One sheet's page: its state, its counters and its columns' summary. NOT_FOUND for another agency's or a disconnected one. */
export async function sheetDetailOf(
  tx: OrgTx,
  sheetId: string,
  now: Date,
  facts: SheetDetailFacts,
): Promise<SheetDetail> {
  const sheet = await findSheet(tx, sheetId);
  const columns = await tx.sheetColumn.findMany({
    where: { connectionId: sheet.id },
    orderBy: { id: "asc" },
    select: { header: true, field: true, isNew: true, isMissing: true },
  });
  // The unresolved problems, on sheet_row_problems.
  const couldntBeAdded = await tx.sheetRow.count({
    where: { connectionId: sheet.id, status: "not_added", resolvedAt: null },
  });
  const importBatch =
    sheet.existingRows === "check"
      ? await tx.importBatch.findFirst({
          where: { sourceSheetId: sheet.id },
          orderBy: { id: "desc" },
          select: { id: true },
        })
      : null;
  const since = sheet.lastCheckedAt ?? sheet.connectedAt;
  return {
    id: sheet.id,
    sheetTitle: sheet.sheetTitle,
    tabTitle: sheet.tabTitle,
    tabGid: sheet.tabGid,
    status: sheet.status,
    step: sheet.step,
    attentionState: attentionOf(sheet.status),
    attentionSince: sheet.attentionSince?.toISOString() ?? null,
    connectedBy: { userId: sheet.connectedBy, name: facts.connectedByName },
    connectedAt: sheet.connectedAt?.toISOString() ?? null,
    serviceAccountEmail: facts.serviceAccountEmail,
    lastCheckedAt: sheet.lastCheckedAt?.toISOString() ?? null,
    checkRunning: sheet.checkStartedAt !== null && now.getTime() - sheet.checkStartedAt.getTime() < claimSeconds * 1000,
    late: sheet.status === "running" && since !== null && now.getTime() - since.getTime() > lateAfterMinutes * 60_000,
    readOnly: facts.readOnly,
    rowsTruncated: sheet.rowsSeen > maxSheetRows,
    counts: {
      added: sheet.rowsAdded,
      mergedIntoExisting: sheet.rowsMerged,
      duplicates: sheet.rowsDuplicate,
      couldntBeAdded,
    },
    columns: {
      matched: columns.filter((column) => column.field !== null).length,
      total: columns.length,
      newUnmatched: columns.filter((column) => column.isNew && column.field === null).map((column) => column.header),
      missing: columns.filter((column) => column.isMissing).map((column) => column.header),
    },
    existingRows: sheet.existingRows,
    existingImportId: importBatch?.id ?? null,
    defaultOwnerName: facts.defaultOwnerName,
  };
}
