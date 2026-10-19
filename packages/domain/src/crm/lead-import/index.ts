// The lead import's listeners (spec 7): the check, a dry run of every row (bulk plan, Task 1.3), and the add, 50 rows
// a transaction (Task 1.4). Each leaves another kind's import, and one no longer at its step, alone.
import { importStepEvent } from "@travel-crm/contracts/imports";
import { importBatchOf, type ImportBatchRow, type ImportJobDependencies } from "../../imports/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../../jobs/index.js";
import { DomainError } from "../../kernel/index.js";
import { addLeadImport } from "./lead-add-job.js";
import { checkLeadImport } from "./lead-check.js";

/** The lead import at `status`, or null for another kind's or one moved on. */
async function leadImportAt(
  context: ListenerContext,
  importId: string,
  status: string,
): Promise<ImportBatchRow | null> {
  const batch = await context.forOrg((tx) => importBatchOf(tx, importId));
  return batch?.kind === "leads" && batch.status === status ? batch : null;
}

export function checkLeadImportListener(dependencies: ImportJobDependencies): EventListener {
  return defineListener({
    name: "crm.check-lead-import",
    eventType: "import.columns-matched",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "leads") return;
      const batch = await leadImportAt(context, event.payload.importId, "checking");
      if (batch === null) return;
      try {
        await checkLeadImport(context, dependencies, batch);
      } catch (error) {
        // The file went meanwhile (an erasure, the sweep): the import is expired or about to be; nothing to check.
        if (!(error instanceof DomainError && error.reason === "ATTACHMENT_NOT_FOUND")) throw error;
      }
    },
  });
}

export function addLeadImportListener(dependencies: ImportJobDependencies): EventListener {
  return defineListener({
    name: "crm.add-lead-import",
    eventType: "import.add-requested",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "leads") return;
      const batch = await leadImportAt(context, event.payload.importId, "adding");
      if (batch === null) return;
      await addLeadImport(context, dependencies, batch, event.id);
    },
  });
}
