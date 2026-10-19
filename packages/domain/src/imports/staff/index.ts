// The staff import's listeners (spec 7): the check against the agency's staff, roles and seats (Task 3.2) and the
// all-or-nothing add (Task 3.3). Each acts only on a staff import at its own step, so a repeat is harmless.
import { importStepEvent } from "@travel-crm/contracts/imports";
import { defineListener, type EventListener, type ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { importBatchOf } from "../batches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import { addStaffImport } from "./staff-add.js";
import { checkStaffImport } from "./staff-check.js";

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
      await checkStaffImport(context, dependencies, batch);
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
      await addStaffImport(event, context, dependencies, batch);
    },
  });
}

export { staffImportDetail, type StaffImportDetail } from "./staff-detail.js";
export { planStaffRows } from "./staff-plan.js";
export { requestStaffImportAdd, setStaffImportPasswords } from "./staff-passwords.js";
export { readStaffRow, type StaffRowReading, type StaffRowValues } from "./staff-row.js";
