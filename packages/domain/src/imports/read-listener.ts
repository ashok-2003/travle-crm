// imports.read-file (spec 7): on import.uploaded, the worker reads the file outside any transaction, keeps its SHA-256
// (B6), sheet and columns, guesses each column's field and suggests each value's target, then moves the import to
// matching, publishing import.read for whatever follows a read (a Google Sheet's connect-time import), or to
// unreadable with the adapter's reason. An import no longer reading is left alone, so a repeat is harmless.
import { createHash } from "node:crypto";
import { importUploadedEvent } from "@travel-crm/contracts/imports";
import { type ReadSheet, SpreadsheetUnreadableError } from "@travel-crm/integrations/spreadsheets";
import { defineListener, type EventListener, publishEvent } from "../jobs/index.js";
import { toBatchRow } from "./batch-row.js";
import { holdImport, moveImport } from "./batches.js";
import { summariseColumns } from "./columns.js";
import type { ImportJobDependencies } from "./dependencies.js";
import { guessFields } from "./guesses.js";
import { headerKey, rememberedFields } from "./header-memory.js";
import { importFileBytes, readLimitsOf } from "./read-file.js";
import { suggestValueMatches, writeValueMatches } from "./value-matches.js";

/** A sheet's name as kept: Excel allows 31 characters, other writers more. */
const MAX_SHEET_NAME = 100;

export function readImportFileListener(dependencies: ImportJobDependencies): EventListener {
  return defineListener({
    name: "imports.read-file",
    eventType: "import.uploaded",
    payload: importUploadedEvent,
    handle: async (event, context) => {
      const found = await context.forOrg((tx) => tx.importBatch.findUnique({ where: { id: event.payload.importId } }));
      const batch = found === null ? null : toBatchRow(found);
      if (batch?.status !== "reading") return;
      const bytes = await importFileBytes(dependencies.files, batch);
      const fileSha256 = Uint8Array.from(createHash("sha256").update(bytes).digest());
      const now = new Date();
      let sheet: ReadSheet;
      try {
        sheet = await dependencies.spreadsheets.read(bytes, readLimitsOf(batch));
      } catch (error) {
        if (!(error instanceof SpreadsheetUnreadableError)) throw error;
        await context.forOrg(async (tx) => {
          if ((await holdImport(tx, batch.id))?.status !== "reading") return;
          await moveImport(tx, batch.id, ["reading"], "unreadable", now, {
            unreadableReason: error.reason,
            fileSha256,
            finishedAt: now,
          });
        });
        return;
      }
      const columns = summariseColumns(sheet);
      const keys = columns.map((column) => headerKey(column.header));
      const remembered = await context.forOrg((tx) => rememberedFields(tx, batch.kind, keys));
      const guesses = guessFields(
        batch.kind,
        columns.map((column) => column.header),
        remembered,
      );
      const suggestions = await suggestValueMatches(
        dependencies.identity,
        batch,
        columns.map((column) => ({ position: column.position, values: column.distinctValues })),
      );
      await context.forOrg(async (tx) => {
        // Held, so a second run waits and then finds the import matching.
        if ((await holdImport(tx, batch.id))?.status !== "reading") return;
        await tx.importColumn.createMany({
          data: columns.map((column, index) => ({
            batchId: batch.id,
            position: column.position,
            header: column.header,
            samples: column.samples,
            distinctValues: column.distinctValues,
            distinctCounts: column.distinctCounts,
            field: guesses[index]?.field ?? null,
            guessedBy: guesses[index]?.guessedBy ?? null,
          })),
        });
        await writeValueMatches(tx, batch.id, suggestions);
        await moveImport(tx, batch.id, ["reading"], "matching", now, {
          fileSha256,
          sheetName: sheet.sheetName?.slice(0, MAX_SHEET_NAME) ?? null,
          sheetCount: sheet.sheetName === null ? null : sheet.sheetCount,
          rowsTotal: sheet.rows.length,
        });
        await publishEvent(tx, { type: "import.read", payload: { importId: batch.id, kind: batch.kind } });
      });
    },
  });
}
