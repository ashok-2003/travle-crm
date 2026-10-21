// sheets.match-import (spec 3.3): on import.read, the connect-time import of a sheet's rows needs no matching step, since
// the columns were matched when the sheet was connected. The columns of the import (the sheet's own header names) take
// the fields of the sheet's columns, the Owner values the person matched by hand carry over, and the check starts as
// the person who connected the sheet. A connector who can no longer act ends the import as it would for a file.
import { type ImportField, importStepEvent } from "@travel-crm/contracts/imports";
import { defineListener, type EventListener } from "../jobs/index.js";
import { holdImport, IMPORT_KEPT_MS, importBatchOf, jobMemberAccess, matchImportColumns } from "../imports/index.js";
import { asSheetField } from "./columns.js";
import { nameColumns } from "./header-keys.js";
import type { SheetsJobDependencies } from "./job-dependencies.js";

export function matchSheetImportListener(dependencies: SheetsJobDependencies): EventListener {
  return defineListener({
    name: "sheets.match-import",
    eventType: "import.read",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "leads") return;
      const batch = await context.forOrg((tx) => importBatchOf(tx, event.payload.importId));
      if (batch?.status !== "matching" || batch.sourceSheetId === null) return;
      const { sourceSheetId } = batch;

      const who = await jobMemberAccess(
        dependencies,
        { organizationId: batch.organizationId, userId: batch.startedBy, impersonatedBy: batch.impersonatedBy },
        ["leads:create", "leads:assign"],
      );
      if ("failure" in who) {
        const now = new Date();
        await context.forOrg(async (tx) => {
          if ((await holdImport(tx, batch.id))?.status !== "matching") return;
          await tx.importBatch.updateMany({
            where: { id: batch.id, status: "matching" },
            data: {
              status: "failed",
              failureReason: who.failure,
              finishedAt: now,
              keepUntil: new Date(now.getTime() + IMPORT_KEPT_MS),
            },
          });
        });
        return;
      }
      const owners = new Set(
        (await dependencies.identity.leadWorkers(batch.organizationId)).map((worker) => worker.userId),
      );
      await context.forOrg(async (tx) => {
        const importColumns = await tx.importColumn.findMany({
          where: { batchId: batch.id },
          orderBy: { position: "asc" },
          select: { position: true, header: true },
        });
        const stored = await tx.sheetColumn.findMany({
          where: { connectionId: sourceSheetId },
          select: { headerKey: true, field: true },
        });
        const fieldOfKey = new Map(
          stored.map((column) => [column.headerKey, asSheetField(column.field as ImportField | null)]),
        );
        const keys = nameColumns(importColumns.map((column) => column.header)).map(({ key }) => key);
        const columns = importColumns.map((column, index) => ({
          position: column.position,
          field: fieldOfKey.get(keys[index] ?? "") ?? null,
        }));
        const chosen = await tx.sheetValueMatch.findMany({
          where: { connectionId: sourceSheetId, field: "owner" },
          select: { value: true, target: true },
        });
        await matchImportColumns(
          tx,
          who.access,
          "leads",
          {
            importId: batch.id,
            columns,
            values: chosen.map((match) => ({ field: "owner" as const, value: match.value, target: match.target })),
            defaults: { stage: "new" },
          },
          { owners, roleKeys: new Set(), now: new Date() },
        );
      });
    },
  });
}
