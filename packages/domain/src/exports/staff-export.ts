// The staff export's listener (B52): the active staff into a file, through runExport. Its source is built by the staff
// branch (bulk plan, Task 3.5); until then a staff export fails here, and the leads' exports are left to their own.
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { defineListener, type EventListener } from "../jobs/index.js";
import type { ExportJobDependencies } from "./dependencies.js";
import { type ExportSource, runExport } from "./export-runner.js";

const notBuilt = (): never => {
  throw new Error("Not built yet: bulk plan, Task 3.5");
};

const staffSource: ExportSource<never> = {
  kind: "staff",
  requires: "staff:manage",
  sheetName: "Staff",
  columns: [],
  fileName: notBuilt,
  filterOf: notBuilt,
  maxRows: null,
  count: notBuilt,
  page: notBuilt,
  auditFilter: notBuilt,
  keptFilter: notBuilt,
};

export function makeStaffExportListener(dependencies: ExportJobDependencies): EventListener {
  return defineListener({
    name: "exports.make-staff-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: (event, context) => runExport(event, context, dependencies, staffSource),
  });
}
