// The staff import's add (B45, B47, D24): the importer's access afresh, the file read and every row checked again as it
// is now, then every account in one identity transaction that also links the rows to their members and drops the
// password hashes. A row that fails now, or too few seats, adds nobody: the import goes back to its preview with the
// row marked and every hash cleared, and the browser makes new passwords. It sends no notice: the importer is on the
// screen for the seconds it takes.
import { encodeRowReason } from "../row-reasons.js";
import type { ImportFailureReason, RowReason } from "@travel-crm/contracts/imports";
import { DomainError } from "../../kernel/index.js";
import { ImportedStaffRowError, type ImportedStaffRow } from "../../identity/index.js";
import type { DomainEvent, ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { holdImport, moveImport } from "../batches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import { finishImport } from "../finish.js";
import { recordRowOutcomes } from "../import-rows.js";
import { importerAccess } from "../importer-access.js";
import { readImportFile } from "../read-file.js";
import { planStaffFile } from "./staff-file.js";
import { untagHash } from "./staff-passwords.js";

/** Whether any of the import's rows has been added: another run of this add got there first. */
const someAdded = (context: ListenerContext, importId: string) =>
  context.forOrg(async (tx) => (await tx.importRow.count({ where: { batchId: importId, outcome: "added" } })) > 0);

/** The import back at its preview: some rows marked, every hash cleared (the browser drops its passwords too). */
async function returnToPreview(
  context: ListenerContext,
  importId: string,
  reason: ImportFailureReason,
  marked: readonly { rowNumber: number; reason: RowReason }[],
): Promise<void> {
  await context.forOrg(async (tx) => {
    if ((await holdImport(tx, importId))?.status !== "adding") return;
    for (const row of marked) {
      await tx.importRow.updateMany({
        where: { batchId: importId, rowNumber: row.rowNumber, outcome: null },
        data: { plan: "not_added", reasons: [encodeRowReason(row.reason)] },
      });
    }
    await tx.importRow.updateMany({ where: { batchId: importId }, data: { passwordHash: null } });
    const rowsToAdd = await tx.importRow.count({ where: { batchId: importId, plan: "new", outcome: null } });
    await moveImport(tx, importId, ["adding"], "checked", new Date(), {
      failureReason: reason,
      rowsToAdd,
      rowsDone: 0,
      addRequestedAt: null,
    });
  });
}

export async function addStaffImport(
  event: DomainEvent,
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
): Promise<void> {
  const end = { sourceEventId: event.id, notifyImporter: false, report: false } as const;
  const importer = await importerAccess(dependencies, batch, ["staff:manage"]);
  if ("failure" in importer) {
    await finishImport(context, dependencies, batch.id, { ...end, status: "failed", failureReason: importer.failure });
    return;
  }
  const waiting = await context.forOrg((tx) =>
    tx.importRow.findMany({
      where: { batchId: batch.id, plan: "new", outcome: null },
      orderBy: { rowNumber: "asc" },
      select: { rowNumber: true, passwordHash: true },
    }),
  );
  // A repeat after the accounts were written finds no row waiting, and only ends the import.
  if (waiting.length > 0) {
    let sheet;
    try {
      sheet = await readImportFile(dependencies, batch);
    } catch (error) {
      if (!(error instanceof DomainError && error.reason === "ATTACHMENT_NOT_FOUND")) throw error;
      await finishImport(context, dependencies, batch.id, {
        ...end,
        status: "failed",
        failureReason: "file_withdrawn",
      });
      return;
    }
    const { readings, plans } = await planStaffFile(context, dependencies, batch, importer.access, sheet);
    const changed = waiting.flatMap((row) => {
      const plan = plans.find((candidate) => candidate.rowNumber === row.rowNumber);
      const reason = plan?.reasons[0] ?? { code: "taken_meanwhile" as const };
      return plan?.plan === "new" ? [] : [{ rowNumber: row.rowNumber, reason }];
    });
    const rows: ImportedStaffRow[] = [];
    for (const row of waiting) {
      const reading = readings.find(
        (candidate) => candidate.kind === "ready" && candidate.values.rowNumber === row.rowNumber,
      );
      if (reading?.kind !== "ready" || row.passwordHash === null) continue;
      rows.push({ ...reading.values, passwordHash: untagHash(row.passwordHash) });
    }
    if (changed.length > 0 || rows.length !== waiting.length) {
      // A run beside this one added the people already: the import is done, never back at a preview that is gone.
      if (await someAdded(context, batch.id))
        return finishImport(context, dependencies, batch.id, { ...end, status: "done" });
      await returnToPreview(context, batch.id, "row_changed", changed);
      return;
    }
    try {
      await dependencies.identity.staff.addImported(importer.access, rows, batch.id, (tx, added) =>
        recordRowOutcomes(
          tx,
          batch.id,
          added.map((person) => ({ rowNumber: person.rowNumber, outcome: "added", memberId: person.memberId })),
        ),
      );
    } catch (error) {
      if (await someAdded(context, batch.id)) {
        return finishImport(context, dependencies, batch.id, { ...end, status: "done" });
      }
      if (error instanceof ImportedStaffRowError) {
        await returnToPreview(context, batch.id, "row_changed", [
          { rowNumber: error.rowNumber, reason: { code: error.reason } },
        ]);
        return;
      }
      if (error instanceof DomainError && error.reason === "IMPORT_OVER_SEAT_LIMIT") {
        await returnToPreview(context, batch.id, "over_seat_limit", []);
        return;
      }
      throw error;
    }
  }
  await finishImport(context, dependencies, batch.id, { ...end, status: "done" });
}
