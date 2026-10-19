// The lead import's add (spec B26-B31, D18, D19): one batch of at most 50 rows in one transaction. Each batch first
// resolves the importer's access afresh, then holds the import's row, stops if Stop was pressed, and takes the next
// rows without an outcome. Every row is decided again against the database as it is now (a contact blocked since the
// check, a lead added by hand meanwhile, an owner who left), saved through the one save path, and given its outcome.
import { isUniqueViolation } from "@travel-crm/db";
import type { ImportFailureReason, RowReason } from "@travel-crm/contracts/imports";
import {
  earlierFingerprints,
  fingerprintHex,
  holdImport,
  importerAccess,
  recordRowOutcomes,
  rowFingerprint,
  rowsToAdd,
  type ImportBatchRow,
  type ImportJobDependencies,
  type RowOutcomeRecord,
} from "../../imports/index.js";
import type { MemberAccess } from "../../identity/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { saveEnquiry } from "../save-enquiry.js";
import { defaultOwnerOf, type LeadFile } from "./lead-read.js";
import { lookUpLeadRows, type LeadLookups } from "./lead-lookups.js";
import type { PlannableRow } from "./lead-plan.js";

/** Rows to a transaction (B26). */
export const ROWS_PER_BATCH = 50;

export type LeadBatchResult = "more" | "done" | "stopped" | "gone" | { failed: ImportFailureReason };

/** Decides and saves the batch's rows. A unique violation aborts the transaction, so the caller runs it again once. */
async function addRows(
  context: ListenerContext,
  importId: string,
  file: LeadFile,
  workers: ReadonlySet<string>,
  access: MemberAccess,
  defaultOwner: string,
  byRow: ReadonlyMap<number, PlannableRow>,
): Promise<LeadBatchResult> {
  return context.forOrg(async (tx) => {
    const batch = await holdImport(tx, importId);
    // Cancelled, expired or finished by a run beside this one: nothing is left to do.
    if (batch?.status !== "adding") return "gone";
    if (batch.stopRequested) return "stopped";
    const rows = await rowsToAdd(tx, importId, ROWS_PER_BATCH);
    if (rows.length === 0) return "done";
    const readings = rows.flatMap((row) => byRow.get(row.rowNumber) ?? []);
    const lookups = await lookUpLeadRows(tx, readings);
    const fingerprints = readings.flatMap((reading) =>
      reading.kind === "enquiry" ? [rowFingerprint("leads", reading.fingerprintValues)] : [],
    );
    const earlier = await earlierFingerprints(tx, "leads", fingerprints, importId);
    const now = new Date();
    const outcomes: RowOutcomeRecord[] = [];
    for (const { rowNumber, plan } of rows) {
      const reading = byRow.get(rowNumber);
      if (reading?.kind !== "enquiry") {
        // The file reads differently than at the check: the row is not added for the reasons it has now.
        outcomes.push({
          rowNumber,
          outcome: "not_added",
          reasons: reading?.kind === "not_added" ? reading.reasons : [],
        });
        continue;
      }
      const fingerprint = rowFingerprint("leads", reading.fingerprintValues);
      const leftOut = leftOutReason(
        batch,
        plan,
        reading.contacts,
        lookups,
        earlier.get(fingerprintHex(fingerprint)),
        file.timeZone,
      );
      if (leftOut !== null) {
        outcomes.push({ rowNumber, outcome: "left_out", ...(leftOut === "plan" ? {} : { reasons: [leftOut] }) });
        continue;
      }
      // An owner who can no longer work leads gives the row to the default owner (D19).
      const ownerUserId = workers.has(reading.ownerUserId) ? reading.ownerUserId : defaultOwner;
      const saved = await saveEnquiry(tx, access, reading.enquiry, now, {
        from: "import",
        ownerUserId,
        stage: reading.stage,
        createdAt: reading.createdAt,
      });
      outcomes.push({
        rowNumber,
        outcome: saved.outcome === "created" ? "added" : "merged",
        leadId: saved.leadId,
        personId: saved.personId,
        fingerprint,
      });
    }
    await recordRowOutcomes(tx, importId, outcomes);
    return rows.length === ROWS_PER_BATCH ? "more" : "done";
  });
}

/** Why the importer's choices leave the row out now, "plan" for the check's own reason, or null to add it. */
function leftOutReason(
  batch: ImportBatchRow,
  plan: string,
  contacts: Parameters<LeadLookups["isBlocked"]>[0],
  lookups: LeadLookups,
  addedAt: Date | undefined,
  timeZone: string,
): RowReason | "plan" | null {
  if (lookups.isBlocked(contacts) && !batch.addBlocked) return { code: "blocked" };
  if (addedAt !== undefined && !batch.addAlreadyImported) {
    return { code: "already_imported", on: calendarDateIn(addedAt, timeZone) };
  }
  return plan === "in_crm" && !batch.addInCrm ? "plan" : null;
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
): Promise<LeadBatchResult> {
  // The importer's access and the lead workers are resolved by identity in transactions of its own, so before ours (B31).
  const resolved = await importerAccess(dependencies, batch, ["leads:create", "leads:assign"]);
  if ("failure" in resolved) return { failed: resolved.failure };
  const workers = new Set(
    (await dependencies.identity.leadWorkers(batch.organizationId)).map((worker) => worker.userId),
  );
  const defaultOwner = await defaultOwnerOf(dependencies, batch, workers);
  const byRow = new Map(file.rows.map((row) => [row.rowNumber, row]));
  const run = () => addRows(context, batch.id, file, workers, resolved.access, defaultOwner, byRow);
  try {
    return await run();
  } catch (error) {
    // Someone added the same contact meanwhile; the second look finds them (R23).
    if (!isUniqueViolation(error)) throw error;
    return run();
  }
}
