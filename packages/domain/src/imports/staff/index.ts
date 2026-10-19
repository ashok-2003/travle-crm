// The staff import's listeners (spec 7): the check against the agency's staff, roles and seats (bulk plan, Task 3.2)
// and the all-or-nothing add (Task 3.3). The staff branch builds them; until then each leaves lead imports to their
// own listeners, takes its first step, and refuses a staff import.
import { importStepEvent } from "@travel-crm/contracts/imports";
import { defineListener, type EventListener, type ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { importBatchOf } from "../batches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import { importerAccess } from "../importer-access.js";
import { readImportFile } from "../read-file.js";

const notBuilt = (task: string) => new Error(`Not built yet: bulk plan, Task ${task}`);

/** The staff import at `status`, or null for another kind's or one moved on. */
async function staffImportAt(
  context: ListenerContext,
  importId: string,
  status: string,
): Promise<ImportBatchRow | null> {
  const batch = await context.forOrg((tx) => importBatchOf(tx, importId));
  return batch?.kind === "staff" && batch.status === status ? batch : null;
}

export function checkStaffImportListener(dependencies: ImportJobDependencies): EventListener {
  return defineListener({
    name: "imports.check-staff-import",
    eventType: "import.columns-matched",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "staff") return;
      const batch = await staffImportAt(context, event.payload.importId, "checking");
      if (batch === null) return;
      await readImportFile(dependencies, batch);
      throw notBuilt("3.2");
    },
  });
}

export function addStaffImportListener(dependencies: ImportJobDependencies): EventListener {
  return defineListener({
    name: "imports.add-staff-import",
    eventType: "import.add-requested",
    payload: importStepEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "staff") return;
      const batch = await staffImportAt(context, event.payload.importId, "adding");
      if (batch === null) return;
      await importerAccess(dependencies, batch, ["staff:manage"]);
      throw notBuilt("3.3");
    },
  });
}
