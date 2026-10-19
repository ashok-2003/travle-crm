// The end of a check that read the sheet (spec 7, S12): in one transaction, "Last checked", the cursor, the counters'
// companions, the header's hash, headers the sheet gained, a recovery from an attention state, and the check's claim let
// go. A check that yielded to an import keeps its cursor, so the rows it did not reach are read again.
import type { OrgTx } from "@travel-crm/db";
import { leaveAttention } from "./attention.js";
import { holdSheet } from "./connection-row.js";
import type { HeaderName } from "./header-keys.js";
import type { Bytes } from "./hashes.js";
import { maxSheetRows } from "./limits.js";

export interface CheckClose {
  now: Date;
  /** The tab's last row read; null when the check yielded and must not move the cursor. */
  cursorRow: number | null;
  /** How many rows the read held; more than maxSheetRows says the tab holds more than is read (S15). */
  rowsSeen: number;
  truncated: boolean;
  headerHash: Bytes;
  full: boolean;
  /** The sheet's and the tab's titles as Google has them now (a full read refreshes the cache). */
  sheetTitle: string | null;
  tabTitle: string;
  /** Headers the sheet gained: new columns nobody has matched (S15). */
  gained: readonly HeaderName[];
}

/** Closes the check; false when the sheet was disconnected meanwhile. */
export async function closeCheck(tx: OrgTx, sheetId: string, close: CheckClose): Promise<boolean> {
  const sheet = await holdSheet(tx, sheetId);
  if (sheet === null || sheet.status === "disconnected") return false;
  if (close.gained.length > 0) {
    await tx.sheetColumn.createMany({
      data: close.gained.map(({ header, key }) => ({
        connectionId: sheetId,
        headerKey: key,
        header,
        isNew: true,
      })),
      skipDuplicates: true,
    });
  }
  await leaveAttention(tx, sheet);
  await tx.sheetConnection.update({
    where: { id: sheetId },
    data: {
      lastCheckedAt: close.now,
      lastOkAt: close.now,
      consecutiveFailures: 0,
      checkStartedAt: null,
      holdUntil: null,
      headerHash: close.headerHash,
      tabTitle: close.tabTitle.slice(0, 100),
      ...(close.sheetTitle === null ? {} : { sheetTitle: close.sheetTitle.slice(0, 200) }),
      ...(close.cursorRow === null
        ? {}
        : { cursorRow: close.cursorRow, rowsSeen: close.truncated ? maxSheetRows + 1 : close.rowsSeen }),
      ...(close.full ? { lastFullReadAt: close.now } : {}),
    },
  });
  return true;
}
