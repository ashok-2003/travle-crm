// The lead import's listeners (spec 7): the check, a dry run of every row (bulk plan, Task 1.3), and the add, 50 rows
// a transaction (Task 1.4). The lead import branch builds them; until then each leaves staff imports to their own
// listeners, takes its first step, and refuses a lead import.
import { importStepEvent } from "@travel-crm/contracts/imports";
import {
  holdImport,
  importerAccess,
  readImportFile,
  type ImportBatchRow,
  type ImportJobDependencies,
} from "../../imports/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../../jobs/index.js";

const notBuilt = (task: string) => new Error(`Not built yet: bulk plan, Task ${task}`);

/** The lead import at `status`, or null for another kind's or one moved on. */
async function leadImportAt(
  context: ListenerContext,
  importId: string,
  status: string,
): Promise<ImportBatchRow | null> {
  const batch = await context.forOrg((tx) => holdImport(tx, importId));
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
      await readImportFile(dependencies, batch);
      throw notBuilt("1.3");
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
      await importerAccess(dependencies, batch, ["leads:create", "leads:assign"]);
      throw notBuilt("1.4");
    },
  });
}
