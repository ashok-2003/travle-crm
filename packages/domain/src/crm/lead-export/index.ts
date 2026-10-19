// The lead export's listener (B41): the Leads list as the person sees it into a file, through runExport. The lead
// export branch builds its source (bulk plan, Task 2.1); until then a lead export fails here, and the staff exports
// are left to their own listener.
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { runExport, type ExportJobDependencies, type ExportSource } from "../../exports/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";

const notBuilt = (): never => {
  throw new Error("Not built yet: bulk plan, Task 2.1");
};

const leadSource: ExportSource<never> = {
  kind: "leads",
  requires: "leads:view",
  sheetName: "Leads",
  columns: [],
  fileName: notBuilt,
  filterOf: notBuilt,
  maxRows: null,
  count: notBuilt,
  page: notBuilt,
  auditFilter: notBuilt,
  keptFilter: notBuilt,
};

export function makeLeadExportListener(dependencies: ExportJobDependencies): EventListener {
  return defineListener({
    name: "crm.make-lead-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: (event, context) => runExport(event, context, dependencies, leadSource),
  });
}
