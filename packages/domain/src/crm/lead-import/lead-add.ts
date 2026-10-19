// The lead import's add (spec B26-B31, D18, D19): one batch of at most 50 rows in one transaction, ended by a clock as
// well as by the count so no transaction nears the database's limit. Each batch first resolves the importer's access
// afresh, then holds the import's row, stops if Stop was pressed, and takes the next rows without an outcome; each is
// decided again and saved (lead-add-row.ts). A batch that fails is run again, a row at a time, so one row that always
// fails is recorded as not added and the rest go through.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { isUniqueViolation } from "@travel-crm/db";
import {
  earlierFingerprints,
  holdImport,
  importerAccess,
  recordRowOutcomes,
  rowFingerprint,
  rowsToAdd,
  type ImportBatchRow,
  type ImportJobDependencies,
} from "../../imports/index.js";
import type { MemberAccess } from "../../identity/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import { addRow } from "./lead-add-row.js";
import { lookUpLeadRows } from "./lead-lookups.js";
import { defaultOwnerOf, type LeadFile } from "./lead-read.js";

/** Rows to a transaction (B26). */
export const ROWS_PER_BATCH = 50;

/**
 * How long a batch's transaction runs before it commits what it has: a fifth of the database's default limit of 5 s
 * for a transaction, and room for the one row under way. A slow host adds fewer rows to a batch, never a failed one.
 */
export const BATCH_TIME_BOX_MS = 1000;

/** The transaction's own limit, a margin and never the plan: the time box is what keeps a batch short (X1). */
const BATCH_TIMEOUT_MS = 15_000;

export type LeadBatchResult = "more" | "done" | "stopped" | "gone" | { failed: ImportFailureReason };

export interface BatchOptions {
  timeBoxMs?: number;
}

interface Who {
  workers: ReadonlySet<string>;
  access: MemberAccess;
  defaultOwner: string;
}

/** Decides and saves up to `limit` rows, stopping early once the time box has passed. */
async function addRows(
  context: ListenerContext,
  importId: string,
  file: LeadFile,
  who: Who,
  limit: number,
  timeBoxMs: number,
): Promise<LeadBatchResult> {
  return context.forOrg(
    async (tx) => {
      const started = performance.now();
      const batch = await holdImport(tx, importId);
      // Cancelled, expired or finished by a run beside this one: nothing is left to do.
      if (batch?.status !== "adding") return "gone";
      if (batch.stopRequested) return "stopped";
      const rows = await rowsToAdd(tx, importId, limit);
      if (rows.length === 0) return "done";
      const readings = rows.flatMap((row) => file.byRow.get(row.rowNumber) ?? []);
      const fingerprints = readings.flatMap((reading) =>
        reading.kind === "enquiry" ? [rowFingerprint("leads", reading.fingerprintValues)] : [],
      );
      const decision = {
        ...who,
        batch,
        lookups: await lookUpLeadRows(tx, readings),
        earlier: await earlierFingerprints(tx, "leads", fingerprints, importId),
        timeZone: file.timeZone,
        now: new Date(),
      };
      const outcomes = [];
      for (const row of rows) {
        // At least one row, so a batch always moves on; then no more once the clock says commit.
        if (outcomes.length > 0 && performance.now() - started >= timeBoxMs) break;
        outcomes.push(await addRow(tx, decision, row, file.byRow.get(row.rowNumber)));
      }
      await recordRowOutcomes(tx, importId, outcomes);
      return outcomes.length < rows.length || rows.length === limit ? "more" : "done";
    },
    { timeout: BATCH_TIMEOUT_MS },
  );
}

/** Records the first row without an outcome as not added: it fails whenever it is tried alone. */
async function recordPoisonRow(context: ListenerContext, importId: string): Promise<void> {
  await context.forOrg(async (tx) => {
    if ((await holdImport(tx, importId))?.status !== "adding") return;
    const [row] = await rowsToAdd(tx, importId, 1);
    if (row === undefined) return;
    await recordRowOutcomes(tx, importId, [
      { rowNumber: row.rowNumber, outcome: "not_added", reasons: [{ code: "could_not_add" }] },
    ]);
  });
}

/** A batch that failed, a row at a time: each row twice before it is the one that can't be added. */
async function addOneByOne(
  context: ListenerContext,
  importId: string,
  file: LeadFile,
  who: Who,
): Promise<LeadBatchResult> {
  for (let attempt = 0; attempt < ROWS_PER_BATCH; attempt += 1) {
    let result: LeadBatchResult | undefined;
    for (let tries = 0; tries < 2 && result === undefined; tries += 1) {
      result = await addRows(context, importId, file, who, 1, 0).catch(() => undefined);
    }
    if (result === undefined) await recordPoisonRow(context, importId);
    else if (result !== "more") return result;
  }
  return "more";
}

/**
 * One batch of the add. Says whether rows are left ("more"), the import is done, was stopped, is gone (no longer
 * adding), or can't go on because of the importer's access. The file is read once by the caller and held for the job.
 */
export async function addLeadBatch(
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
  file: LeadFile,
  options: BatchOptions = {},
): Promise<LeadBatchResult> {
  // The importer's access and the lead workers are resolved by identity in transactions of its own, so before ours (B31).
  const resolved = await importerAccess(dependencies, batch, ["leads:create", "leads:assign"]);
  if ("failure" in resolved) return { failed: resolved.failure };
  const workers = new Set(
    (await dependencies.identity.leadWorkers(batch.organizationId)).map((worker) => worker.userId),
  );
  const who = { workers, access: resolved.access, defaultOwner: await defaultOwnerOf(dependencies, batch, workers) };
  const run = () => addRows(context, batch.id, file, who, ROWS_PER_BATCH, options.timeBoxMs ?? BATCH_TIME_BOX_MS);
  try {
    return await run();
  } catch (first) {
    try {
      // Someone added the same contact meanwhile; the second look finds them (R23).
      if (isUniqueViolation(first)) return await run();
    } catch {
      // Fails again: a row at a time.
    }
    return addOneByOne(context, batch.id, file, who);
  }
}
