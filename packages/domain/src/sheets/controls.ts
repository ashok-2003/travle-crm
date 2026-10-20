// What the people who manage a sheet can do (S38, S41, S42, S44): pause and resume, disconnect, Sync now, and Check again.
// Pause, Resume and Disconnect only reduce what happens, so they are open while the agency is read-only (the procedures
// mark them lifecycle "always"). Sync now and Check again publish sheet.sync-requested for the check listener.
import type { RecheckSheetInput } from "@travel-crm/contracts/sheets";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, newUuidV7 } from "../kernel/index.js";
import { releaseClaimIfUnused } from "./claim.js";
import { holdSheet, type SheetConnectionRow, sheetNotReady } from "./connection-row.js";
import type { SheetsDependencies } from "./dependencies.js";
import { notSetUp, refusalFor } from "./google-refusals.js";
import { claimSeconds, syncCooldownSeconds } from "./limits.js";

const busy = () => new DomainError("CONFLICT", "SHEET_BUSY", "The sheet was checked a moment ago");
const alreadyConnected = () =>
  new DomainError("CONFLICT", "SHEET_ALREADY_CONNECTED", "This sheet is already connected here");

/** The sheet, held, at one of these statuses. A draft has no controls: it is not connected yet. */
async function heldAt(tx: OrgTx, sheetId: string, statuses: readonly SheetConnectionRow["status"][]) {
  const sheet = await holdSheet(tx, sheetId);
  if (sheet === null || sheet.status === "disconnected")
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
  if (!statuses.includes(sheet.status)) throw sheetNotReady();
  return sheet;
}

const connected: readonly SheetConnectionRow["status"][] = [
  "running",
  "paused",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
];

/** Pause (S41): the checks stop with the cursor where it is. Pausing a paused sheet changes nothing. */
export async function pauseSheet(tx: OrgTx, access: MemberAccess, sheetId: string): Promise<void> {
  const sheet = await heldAt(tx, sheetId, connected);
  if (sheet.status === "paused") return;
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { status: "paused", attentionSince: null, checkStartedAt: null },
  });
  await recordAudit(tx, access, {
    action: "sheet.paused",
    entityType: "sheet_connection",
    entityId: sheet.id,
    before: { status: sheet.status },
    after: { status: "paused" },
  });
  await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId: sheet.id } });
}

/** Resume (S41): the checks continue from the cursor, and rows added meanwhile are added then. */
export async function resumeSheet(tx: OrgTx, access: MemberAccess, sheetId: string): Promise<void> {
  const sheet = await heldAt(tx, sheetId, ["paused"]);
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { status: "running", consecutiveFailures: 0, holdUntil: null },
  });
  await recordAudit(tx, access, {
    action: "sheet.resumed",
    entityType: "sheet_connection",
    entityId: sheet.id,
    before: { status: "paused" },
    after: { status: "running" },
  });
  await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId: sheet.id } });
}

/**
 * Disconnect (S42): the sheet's ledger, columns and value matches are deleted in the same transaction, the connection stays
 * with its counters as the record of what the sheet did, and the spreadsheet's claim is let go when no other tab of it
 * is connected. The entry holds the counters and no title.
 */
export async function disconnectSheet(db: Database, access: MemberAccess, sheetId: string, now: Date): Promise<void> {
  const claimId = await db.forOrg(
    access.organizationId,
    async (tx) => {
      const sheet = await holdSheet(tx, sheetId);
      if (sheet === null || sheet.status === "disconnected")
        throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
      // An erased customer's rows stay (keyed hashes only): connecting the sheet again must not bring them back (S43).
      await tx.sheetRow.deleteMany({ where: { connectionId: sheet.id, status: { not: "erased" } } });
      await tx.sheetColumn.deleteMany({ where: { connectionId: sheet.id } });
      await tx.sheetValueMatch.deleteMany({ where: { connectionId: sheet.id } });
      await tx.sheetConnection.update({
        where: { id: sheet.id },
        data: { status: "disconnected", disconnectedAt: now, checkStartedAt: null, attentionSince: null },
      });
      await recordAudit(tx, access, {
        action: "sheet.disconnected",
        entityType: "sheet_connection",
        entityId: sheet.id,
        before: { status: sheet.status },
        after: {
          status: "disconnected",
          rowsAdded: sheet.rowsAdded,
          rowsMerged: sheet.rowsMerged,
          rowsDuplicate: sheet.rowsDuplicate,
        },
      });
      await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId: sheet.id } });
      return sheet.claimId;
    },
    { timeout: 30_000 },
  );
  if (claimId !== null) await releaseClaimIfUnused(db, access.organizationId, claimId);
}

/**
 * Sync now (S38): a full read, ending the wait of S29, for a running sheet. Refused with SHEET_BUSY within 30 seconds of
 * the last check, while one runs, or when a request is already on its way.
 */
export async function requestSyncNow(tx: OrgTx, sheetId: string, now: Date): Promise<void> {
  const sheet = await heldAt(tx, sheetId, ["running"]);
  const cooling =
    sheet.lastCheckedAt !== null && now.getTime() - sheet.lastCheckedAt.getTime() < syncCooldownSeconds * 1000;
  const running = sheet.checkStartedAt !== null && now.getTime() - sheet.checkStartedAt.getTime() < claimSeconds * 1000;
  const asked = await tx.outboxEvent.findFirst({
    where: {
      type: "sheet.sync-requested",
      payload: { path: ["sheetId"], equals: sheet.id },
      // UUID v7 ids sort by time: only the events of the last half minute are looked at, on the primary key.
      id: { gt: newUuidV7(now.getTime() - syncCooldownSeconds * 1000) },
    },
    select: { id: true },
  });
  if (cooling || running || asked !== null) throw busy();
  await publishEvent(tx, { type: "sheet.sync-requested", payload: { sheetId: sheet.id, mode: "sync-now" } });
}

/**
 * Check again (S39, S40, S21) for a sheet that lost access or its tab: tries at once. With another tab it is read from
 * that tab, the rows already seen kept (they are not added again). A sheet that never got its baseline asks for it again.
 */
export async function recheckSheet(
  db: Database,
  dependencies: SheetsDependencies,
  access: MemberAccess,
  input: RecheckSheetInput,
  now: Date,
): Promise<void> {
  const sheet = await db.forOrg(access.organizationId, (tx) =>
    heldAt(tx, input.sheetId, ["lost_access", "tab_missing"]),
  );
  let tab: { gid: string; title: string } | null = null;
  if (input.tabGid !== undefined) {
    const { google } = dependencies;
    if (google === null) throw notSetUp();
    const description = await google
      .describe(sheet.serviceAccountIndex, sheet.spreadsheetId, { tabGid: input.tabGid })
      .catch((error: unknown) => {
        throw refusalFor(error);
      });
    if (description.chosenTab?.gid !== input.tabGid) throw sheetNotReady();
    tab = { gid: description.chosenTab.gid, title: description.chosenTab.title };
  }
  await db.forOrg(access.organizationId, async (tx) => {
    const held = await heldAt(tx, input.sheetId, ["lost_access", "tab_missing"]);
    if (tab !== null && tab.gid !== held.tabGid) {
      const taken = await tx.sheetConnection.findFirst({
        where: {
          spreadsheetId: held.spreadsheetId,
          tabGid: tab.gid,
          status: { not: "disconnected" },
          id: { not: held.id },
        },
        select: { id: true },
      });
      if (taken !== null) throw alreadyConnected();
    }
    if (held.connectedAt === null) {
      // The baseline never ran (the share was removed between Confirm and the job): ask for it again.
      await tx.sheetConnection.update({
        where: { id: held.id },
        data: {
          status: "connecting",
          step: "done",
          attentionSince: null,
          touchedAt: now,
          ...(tab === null ? {} : { tabGid: tab.gid, tabTitle: tab.title.slice(0, 100) }),
        },
      });
      await publishEvent(tx, { type: "sheet.baseline-requested", payload: { sheetId: held.id } });
      return;
    }
    if (tab !== null) {
      await tx.sheetConnection.update({
        where: { id: held.id },
        data: { tabGid: tab.gid, tabTitle: tab.title.slice(0, 100), holdUntil: null },
      });
    }
    await publishEvent(tx, { type: "sheet.sync-requested", payload: { sheetId: held.id, mode: "recheck" } });
  });
}
