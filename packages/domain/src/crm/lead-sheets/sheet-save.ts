// Saving a check's rows (S25): one transaction of at most fifty decisions, ended early by a clock so none nears the
// database's limit (the lead import's own box). Each holds the connection first, so two runs of a check take turns; gives
// way to an import that is adding; leaves out a row that already has an outcome; applies the rules again to the database
// as it is now (a contact blocked since the plan, the same row added meanwhile); saves through the one save path; and writes
// each outcome and the counters in the same transaction.
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../../identity/index.js";
import { isAnyImportAdding } from "../../imports/index.js";
import {
  holdSheet,
  isKnown,
  lockAddAgainstChecks,
  ledgerKey,
  lookUpLedger,
  type ReadRow,
  rowsPerTransaction,
  type SheetsHashes,
} from "../../sheets/index.js";
import { saveEnquiry } from "../save-enquiry.js";
import { BATCH_TIME_BOX_MS } from "../lead-import/lead-add.js";
import { lookUpSheetRows } from "./sheet-lookups.js";
import { planSheetRows, type SheetRowDecision } from "./sheet-plan.js";

export interface PlannedRow {
  row: ReadRow;
  decision: SheetRowDecision;
}

export interface SaveBatchContext {
  sheetId: string;
  access: MemberAccess;
  hashes: SheetsHashes | null;
  workers: ReadonlySet<string>;
  defaultOwnerUserId: string;
  /** Owners with more rows than the usual notices cover: their leads are told in one summary, not one by one. */
  summarised: ReadonlySet<string>;
  now: Date;
}

export interface SavedBatch {
  /** How many of the decisions were dealt with: saved, written down, or found already done. */
  processed: number;
  /** The sheet is no longer there to be saved to, or an import started adding: the rest waits for the next check. */
  stopped: "yielded" | "gone" | null;
  /** The leads and repeat enquiries made for each owner. */
  madeFor: Map<string, number>;
  /** What the batch did to the rows it dealt with, for the check's summary line. */
  counts: BatchCounts;
}

export interface BatchCounts {
  added: number;
  merged: number;
  duplicate: number;
  /** Rows that could not be added (the sheet's problems). */
  problems: number;
}

export const noCounts = (): BatchCounts => ({ added: 0, merged: 0, duplicate: 0, problems: 0 });

const cut = (text: string | null) => (text === null ? null : text.slice(0, 120));

/** Applies the rules again to the rows this batch would save: what became of them since the plan, by row number. */
async function replan(
  tx: OrgTx,
  context: SaveBatchContext,
  open: readonly PlannedRow[],
): Promise<Map<number, SheetRowDecision>> {
  const saves = open.flatMap(({ row, decision }) => (decision.kind === "save" ? [{ row, decision }] : []));
  if (saves.length === 0) return new Map();
  const lookups = await lookUpSheetRows(
    tx,
    saves.map(({ decision }) => decision.reading),
    context.hashes,
    context.sheetId,
  );
  const again = planSheetRows(
    saves.map(({ row, decision }) => ({
      row,
      reading: decision.reading,
      ledger: undefined,
      mode: "scheduled" as const,
      isErased: (contacts) => lookups.isErased(contacts),
      isBlocked: (contacts) => lookups.lookups.isBlocked(contacts),
      earlier: lookups.earlier,
      baseline: lookups.baseline,
    })),
  );
  return new Map(
    saves.flatMap(({ row }, index) => (again[index] === undefined ? [] : [[row.rowNumber, again[index]]])),
  );
}

/** One transaction of the check's decisions from the first on, at most fifty and ended early by the clock. */
export async function saveSheetBatch(
  tx: OrgTx,
  context: SaveBatchContext,
  decisions: readonly PlannedRow[],
  options: { limit?: number; timeBoxMs?: number } = {},
): Promise<SavedBatch> {
  const started = performance.now();
  const sheet = await holdSheet(tx, context.sheetId);
  const madeFor = new Map<string, number>();
  if (sheet === null || sheet.status === "disconnected" || sheet.status === "paused") {
    return { processed: 0, stopped: "gone", madeFor, counts: noCounts() };
  }
  // Taking turns with an import's Add: whichever starts second sees the first's flag (SD11), so the lock comes before
  // the heartbeat is written and before the flag is read.
  await lockAddAgainstChecks(tx, sheet.organizationId);
  await tx.sheetConnection.update({ where: { id: sheet.id }, data: { checkStartedAt: context.now } });
  if (await isAnyImportAdding(tx)) return { processed: 0, stopped: "yielded", madeFor, counts: noCounts() };

  const batch = decisions.slice(0, options.limit ?? rowsPerTransaction);
  const ledger = await lookUpLedger(
    tx,
    sheet.id,
    batch.map(({ row }) => row),
    context.hashes,
  );
  const entryOf = (row: ReadRow) => ledger.get(ledgerKey(row.hash, row.occurrence));
  const replanned = await replan(
    tx,
    context,
    batch.filter(({ row }) => !isKnown(entryOf(row))),
  );
  const counts = noCounts();
  const timeBox = options.timeBoxMs ?? BATCH_TIME_BOX_MS;
  let processed = 0;
  for (const planned of batch) {
    // At least one row, so a batch always moves on; then no more once the clock says commit.
    if (processed > 0 && performance.now() - started >= timeBox) break;
    processed += 1;
    // A row with an outcome is never saved again (S25): a retried check carries on from the rows without one.
    if (isKnown(entryOf(planned.row))) continue;
    const decision = replanned.get(planned.row.rowNumber) ?? planned.decision;
    const { row } = planned;
    const existing = entryOf(row);
    const write = async (data: {
      status: "pending" | "added" | "merged" | "duplicate" | "not_added" | "before_connect";
      reasons?: string[];
      fingerprint?: Uint8Array<ArrayBuffer> | null;
      leadId?: string | null;
      personId?: string | null;
      exampleName?: string | null;
      exampleValue?: string | null;
    }) => {
      const values = {
        rowNumber: row.rowNumber,
        status: data.status,
        reasons: data.reasons ?? [],
        fingerprint: data.fingerprint ?? null,
        leadId: data.leadId ?? null,
        personId: data.personId ?? null,
        exampleName: cut(data.exampleName ?? null),
        exampleValue: cut(data.exampleValue ?? null),
        resolvedAt: null,
        processedAt: data.status === "pending" ? null : context.now,
      };
      if (existing === undefined) {
        await tx.sheetRow.create({
          data: { connectionId: sheet.id, rawHash: row.hash, occurrence: row.occurrence, ...values },
        });
      } else {
        // A problem hidden by hand stays hidden while the row is still the same problem; the next outcome shows it.
        const { resolvedAt, ...rest } = values;
        const sameProblem = existing.status === "not_added" && data.status === "not_added";
        await tx.sheetRow.update({ where: { id: existing.id }, data: sameProblem ? rest : { ...rest, resolvedAt } });
      }
    };
    switch (decision.kind) {
      case "pending":
        await write({ status: "pending" });
        break;
      case "not_added":
        counts.problems += 1;
        await write({
          status: "not_added",
          reasons: decision.reasons,
          exampleName: decision.exampleName,
          exampleValue: decision.exampleValue,
        });
        break;
      case "duplicate":
        counts.duplicate += 1;
        await write({ status: "duplicate", fingerprint: new Uint8Array(decision.fingerprint) });
        break;
      case "known":
        // Moved by a column or a sort, not new: it is as it was at connect, and counted nowhere.
        {
          const fingerprint =
            context.hashes === null ? null : new Uint8Array(context.hashes.rekey(decision.fingerprint));
          await write({ status: "before_connect", fingerprint });
          // The row it was before the columns changed is the same row on the same line of the sheet: it goes, so the
          // ledger does not hold every row twice, then four times, as columns come and go (M1).
          if (fingerprint !== null) {
            await tx.sheetRow.deleteMany({
              where: {
                connectionId: sheet.id,
                status: "before_connect",
                rowNumber: row.rowNumber,
                fingerprint,
                NOT: { rawHash: row.hash },
              },
            });
          }
        }
        break;
      case "save": {
        const { reading } = decision;
        // An owner who can no longer work leads gives the row to the agency Owner (D19).
        const ownerUserId = context.workers.has(reading.ownerUserId) ? reading.ownerUserId : context.defaultOwnerUserId;
        const saved = await saveEnquiry(tx, context.access, reading.enquiry, context.now, {
          from: "import",
          ownerUserId,
          stage: "new",
          createdAt: reading.createdAt,
          notify: context.summarised.has(ownerUserId) ? "none" : "each",
          // A row naming no owner goes by the agency's assignment (release C).
          ...(ownerUserId === context.defaultOwnerUserId && { assign: { workers: context.workers } }),
        });
        const created = saved.outcome === "created";
        counts[created ? "added" : "merged"] += 1;
        const forOwner = saved.leadOwnerUserId ?? ownerUserId;
        madeFor.set(forOwner, (madeFor.get(forOwner) ?? 0) + 1);
        await write({
          status: created ? "added" : "merged",
          fingerprint: new Uint8Array(decision.fingerprint),
          leadId: saved.leadId,
          personId: saved.personId,
        });
        break;
      }
    }
  }
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: {
      rowsAdded: { increment: counts.added },
      rowsMerged: { increment: counts.merged },
      rowsDuplicate: { increment: counts.duplicate },
    },
  });
  return { processed, stopped: null, madeFor, counts };
}

/**
 * A row that fails whenever it is tried alone is written down as not added, so the rows after it go through (as the lead
 * import's add does for its poison row). It is listed on the sheet's page, and Sync now tries it again.
 */
export async function recordCouldNotAdd(tx: OrgTx, context: SaveBatchContext, planned: PlannedRow): Promise<void> {
  const sheet = await holdSheet(tx, context.sheetId);
  if (sheet === null) return;
  const { row, decision } = planned;
  const entry = (await lookUpLedger(tx, sheet.id, [row], context.hashes)).get(ledgerKey(row.hash, row.occurrence));
  if (isKnown(entry)) return;
  const values = {
    rowNumber: row.rowNumber,
    status: "not_added",
    reasons: ["could_not_add"],
    fingerprint: null,
    leadId: null,
    personId: null,
    exampleName: decision.kind === "save" ? cut(decision.reading.exampleName) : null,
    exampleValue: null,
    resolvedAt: null,
    processedAt: context.now,
  };
  if (entry === undefined) {
    await tx.sheetRow.create({
      data: { connectionId: sheet.id, rawHash: row.hash, occurrence: row.occurrence, ...values },
    });
  } else {
    await tx.sheetRow.update({ where: { id: entry.id }, data: values });
  }
}
