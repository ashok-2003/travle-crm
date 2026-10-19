// The lead import's add as a job (spec 7, B26-B28, B34): reads the file once, adds it a batch at a time until a batch
// says otherwise, then ends the import: the report of rows not added, the importer's notice and the owners' notices.
// A re-dispatched job carries on from the rows without an outcome.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { finishImport, type ImportBatchRow, type ImportEnd, type ImportJobDependencies } from "../../imports/index.js";
import { publishEvent, type ListenerContext } from "../../jobs/index.js";
import { DomainError, systemActor } from "../../kernel/index.js";
import { addLeadBatch, type BatchOptions, type LeadBatchResult } from "./lead-add.js";
import { readLeadFile, type LeadFile } from "./lead-read.js";
import { noticeImportedOwners } from "./owner-notices.js";

function endOf(result: Exclude<LeadBatchResult, "more" | "gone">, sourceEventId: string): ImportEnd {
  const base = { sourceEventId, notifyImporter: true, report: true };
  if (result === "done" || result === "stopped") return { ...base, status: result };
  return { ...base, status: "failed", failureReason: result.failed };
}

/**
 * How long one run of the add works before it hands the rest to a run of its own: well inside pg-boss's 15 minutes for
 * a job, so a restart of the worker resumes the add within a tick, and a long import never overlaps itself.
 */
export const ADD_RUN_MS = 3 * 60 * 1000;

export async function addLeadImport(
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
  sourceEventId: string,
  options: { runMs?: number; batch?: BatchOptions } = {},
): Promise<void> {
  let file: LeadFile;
  try {
    file = await readLeadFile(context, dependencies, batch);
  } catch (error) {
    if (!(error instanceof DomainError && error.reason === "ATTACHMENT_NOT_FOUND")) throw error;
    const failureReason: ImportFailureReason = "file_withdrawn";
    await finishImport(context, dependencies, batch.id, {
      status: "failed",
      failureReason,
      sourceEventId,
      notifyImporter: true,
      report: false,
    });
    return;
  }
  const until = Date.now() + (options.runMs ?? ADD_RUN_MS);
  let result: LeadBatchResult;
  do {
    result = await addLeadBatch(context, dependencies, batch, file, options.batch);
    if (result === "more" && Date.now() >= until) {
      // Out of time: the next run, carrying only the import's id, picks up at the rows without an outcome.
      await context.forOrg((tx) =>
        publishEvent(tx, { type: "import.add-requested", payload: { importId: batch.id, kind: "leads" } }),
      );
      return;
    }
  } while (result === "more");
  if (result === "gone") return;
  await finishImport(context, dependencies, batch.id, endOf(result, sourceEventId), (tx, held) =>
    noticeImportedOwners(tx, systemActor(batch.organizationId), held, sourceEventId),
  );
}
