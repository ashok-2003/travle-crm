// The staff import's check (spec 7, B25 for staff): a dry run over every row, planned new or not added with its
// reasons, and the preview's counts. It changes no account. The importer's access is resolved afresh, as the add's is;
// if they can no longer import, or the file was deleted, the import ends failed rather than waiting for ever.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { DomainError } from "../../kernel/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { holdImport, moveImport } from "../batches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import { markImportChecked, replaceImportRows } from "../import-rows.js";
import { importerAccess } from "../importer-access.js";
import { readImportFile } from "../read-file.js";
import { planStaffFile } from "./staff-file.js";

/** Ends a check that can't go on: only an import still checking moves. */
async function failCheck(context: ListenerContext, importId: string, reason: ImportFailureReason): Promise<void> {
  await context.forOrg(async (tx) => {
    if ((await holdImport(tx, importId))?.status !== "checking") return;
    const now = new Date();
    await moveImport(tx, importId, ["checking"], "failed", now, { failureReason: reason, finishedAt: now });
  });
}

export async function checkStaffImport(
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
): Promise<void> {
  // A try the add sent back to the preview (D24) leaves its reason on the import: this check starts afresh.
  await context.forOrg((tx) => tx.importBatch.update({ where: { id: batch.id }, data: { failureReason: null } }));
  const importer = await importerAccess(dependencies, batch, ["staff:manage"]);
  if ("failure" in importer) return failCheck(context, batch.id, importer.failure);
  let sheet;
  try {
    sheet = await readImportFile(dependencies, batch);
  } catch (error) {
    if (error instanceof DomainError && error.reason === "ATTACHMENT_NOT_FOUND") {
      return failCheck(context, batch.id, "file_withdrawn");
    }
    throw error;
  }
  const { plans } = await planStaffFile(context, dependencies, batch, importer.access, sheet);
  await replaceImportRows(context, batch.id, plans);
  await context.forOrg((tx) =>
    markImportChecked(
      tx,
      batch.id,
      { rowsTotal: sheet.rows.length, rowsToAdd: plans.filter((plan) => plan.plan === "new").length, rowsNewStage: 0 },
      new Date(),
    ),
  );
}
