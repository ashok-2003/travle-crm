// sheets.baseline (spec 7, S14, S21): on sheet.baseline-requested the worker reads the whole tab and records every row
// present as before_connect (its hash and occurrence only), so nothing present at connect time is ever added by the
// sync, however the sheet is sorted later. With "also check the rows already there" it also stores the newest as an
// ordinary lead import's file. Then the cursor goes to the tab's last row and the sheet starts running.
import { sheetBaselineRequestedEvent } from "@travel-crm/contracts/sheets";
import { GoogleSheetsError } from "@travel-crm/integrations/google-sheets";
import { defineListener, type EventListener, publishEvent } from "../jobs/index.js";
import { startImportFromBytes } from "../imports/index.js";
import { enterAttention } from "./attention.js";
import { connectImportCsv } from "./connect-import-file.js";
import { holdSheet, sheetOf } from "./connection-row.js";
import { hex, uuidFromText } from "./hashes.js";
import { headerHashOf } from "./header-match.js";
import type { SheetsJobDependencies } from "./job-dependencies.js";
import { baselineRowsPerTransaction, maxSheetRows } from "./limits.js";
import { numberRows } from "./numbered-rows.js";
import { readSheetTab } from "./read-tab.js";

/** The reasons Google answers that no retry will change (S21): the share was removed, or the sheet or its tab went. */
const permanent: ReadonlySet<string> = new Set(["not_shared", "not_found", "not_a_sheet", "tab_missing"]);

/** The name an import made from a sheet's rows carries: the sheet's name and the day. */
function importFileName(sheetTitle: string, now: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone }).format(now);
  const title = sheetTitle.replaceAll(/[\\/:*?"<>|]+|\p{Cc}+/gu, " ").trim() || "Google Sheet";
  return `${title.slice(0, 150)} · ${day}.csv`;
}

function keyedFingerprint(hashes: SheetsJobDependencies["hashes"], fingerprint: Uint8Array | null | undefined) {
  return hashes === null || fingerprint === null || fingerprint === undefined
    ? null
    : new Uint8Array(hashes.rekey(fingerprint));
}

export function baselineListener(dependencies: SheetsJobDependencies): EventListener {
  const { db, google } = dependencies;
  return defineListener({
    name: "sheets.baseline",
    eventType: "sheet.baseline-requested",
    payload: sheetBaselineRequestedEvent,
    handle: async (event, context) => {
      const { sheetId } = event.payload;
      const sheet = await context.forOrg((tx) => sheetOf(tx, sheetId));
      if (sheet?.status !== "connecting" || sheet.step !== "done") return;
      if (google === null) throw new Error("Google Sheets is not set up");

      // Outside any transaction: a request to Google must not hold a database connection.
      let read;
      try {
        read = await readSheetTab(google, sheet, 2);
      } catch (error) {
        if (!(error instanceof GoogleSheetsError) || !permanent.has(error.reason)) throw error;
        await context.forOrg(async (tx) => {
          const held = await holdSheet(tx, sheetId);
          if (held?.status === "connecting")
            await enterAttention(tx, { sheet: held, state: "lost_access", now: new Date() });
        });
        return;
      }
      const rows = numberRows(read.read.rows);
      // What each row holds, as a fingerprint kept keyed (a column added later changes every row's hash, not this), and
      // whether it is an erased customer's: by contact, or by the same cells as a row of any sheet erased before (S43).
      const { hashes } = dependencies;
      const held =
        dependencies.baselineFingerprints === undefined || hashes === null
          ? []
          : await dependencies.baselineFingerprints(sheet, { header: read.read.header, rows });
      const keyedHashes = rows.map((row) => (hashes === null ? null : hashes.rekey(row.hash)));
      const erasedBefore = new Set<string>();
      const asked = keyedHashes.flatMap((hash) => hash ?? []);
      if (asked.length > 0) {
        await context.forOrg(async (tx) => {
          for (let start = 0; start < asked.length; start += baselineRowsPerTransaction) {
            const found = await tx.sheetRow.findMany({
              where: { status: "erased", rawHash: { in: asked.slice(start, start + baselineRowsPerTransaction) } },
              select: { rawHash: true },
            });
            for (const row of found) erasedBefore.add(hex(row.rawHash));
          }
        });
      }
      const erasedAt = (index: number) =>
        held[index]?.erased === true || erasedBefore.has(hex(keyedHashes[index] ?? new Uint8Array()));
      for (let start = 0; start < rows.length; start += baselineRowsPerTransaction) {
        const chunk = rows.slice(start, start + baselineRowsPerTransaction);
        await context.forOrg(
          (tx) =>
            tx.sheetRow.createMany({
              data: chunk.map((row, index) => {
                const at = start + index;
                const erased = erasedAt(at);
                const fingerprint = held[at]?.fingerprint ?? null;
                return {
                  connectionId: sheetId,
                  // An erased customer's row keeps only keyed hashes, here as everywhere (S43).
                  rawHash: erased ? (keyedHashes[at] ?? row.hash) : row.hash,
                  occurrence: row.occurrence,
                  rowNumber: row.rowNumber,
                  status: erased ? "erased" : "before_connect",
                  fingerprint: keyedFingerprint(hashes, fingerprint),
                  processedAt: new Date(),
                };
              }),
              skipDuplicates: true,
            }),
          { timeout: 30_000, maxWait: 10_000 },
        );
      }

      if (sheet.existingRows === "check" && rows.length > 0) {
        // The rows of erased customers never reach the import.
        const erasedRows = new Set(rows.flatMap((row, index) => (erasedAt(index) ? [row.rowNumber] : [])));
        const file = await connectImportCsv(dependencies.spreadsheets, {
          header: read.read.header,
          rows: read.read.rows.filter((row) => !erasedRows.has(row.rowNumber)),
        });
        const now = new Date();
        const timeZone = sheet.sheetTimeZone;
        await startImportFromBytes(
          db,
          dependencies.files,
          {
            importId: uuidFromText(`sheet-import:${sheetId}`),
            organizationId: sheet.organizationId,
            startedBy: sheet.connectedBy,
            impersonatedBy: sheet.impersonatedBy,
            fileName: importFileName(sheet.sheetTitle, now, timeZone),
            bytes: file.bytes,
            sourceSheetId: sheetId,
          },
          now,
        );
      }

      const now = new Date();
      await context.forOrg(async (tx) => {
        const held = await holdSheet(tx, sheetId);
        // A rerun finds the sheet running already; one disconnected meanwhile stays so.
        if (held?.status !== "connecting" || held.step !== "done") return;
        await tx.sheetConnection.update({
          where: { id: sheetId },
          data: {
            status: "running",
            tabTitle: read.tabTitle.slice(0, 100),
            cursorRow: read.read.lastRow,
            // More than the limit says the tab holds more rows than are read (S15).
            rowsSeen: read.read.truncated ? maxSheetRows + 1 : rows.length,
            headerHash: headerHashOf(read.read.header),
            connectedAt: now,
            lastCheckedAt: now,
            lastOkAt: now,
            lastFullReadAt: now,
            consecutiveFailures: 0,
            attentionSince: null,
          },
        });
        await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId } });
      });
    },
  });
}
