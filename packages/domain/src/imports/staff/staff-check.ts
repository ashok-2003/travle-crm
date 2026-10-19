// The staff import's check (spec 7, B25 for staff): a dry run over every row, planned new or not added with its
// reasons, and the preview's counts. It changes no account. The importer's access is resolved afresh, as the add's is;
// if they can no longer import, or the file was deleted, the import ends failed rather than waiting for ever.
import type { ImportFailureReason } from "@travel-crm/contracts/imports";
import { DomainError } from "../../kernel/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { holdImport, moveImport } from "../batches.js";
import { columnMatchesOf } from "../column-matches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import { markImportChecked, replaceImportRows } from "../import-rows.js";
import { importerAccess } from "../importer-access.js";
import { readImportFile } from "../read-file.js";
import { valueTargetsFor } from "../value-matches.js";
import { namesOfReadyRows, planStaffRows } from "./staff-plan.js";
import { readStaffRow } from "./staff-row.js";

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
  const columns = await context.forOrg((tx) => columnMatchesOf(tx, batch.id));
  const rolePosition = columns.positionsOf("role")[0];
  const roleCells = rolePosition === undefined ? [] : sheet.rows.map((row) => row.cells[rolePosition] ?? null);
  const roleTargets = await valueTargetsFor(
    context,
    dependencies.identity,
    batch,
    "role",
    roleCells.filter((cell): cell is string => cell !== null && cell.trim() !== ""),
  );
  const readings = sheet.rows.map((row) =>
    readStaffRow(row, {
      columns,
      roleOf: (value) => roleTargets.get(value) ?? null,
      defaultRoleKey: batch.defaultRoleKey,
    }),
  );
  const facts = await dependencies.identity.staff.rowFacts(importer.access, namesOfReadyRows(readings));
  const plans = planStaffRows(readings, facts);
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
