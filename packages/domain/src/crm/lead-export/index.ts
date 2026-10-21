// The lead export's listener (B41): the Leads list as the person sees it into a file, through runExport, with the
// agency's time zone for the file's dates and its name. A staff export is left to its own listener.
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { runExport, type ExportJobDependencies } from "../../exports/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";
import { leadExportSource } from "./lead-export-source.js";

export function makeLeadExportListener(dependencies: ExportJobDependencies): EventListener {
  return defineListener({
    name: "crm.make-lead-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: async (event, context) => {
      const timeZone = await context.forOrg((tx) => organizationTimeZone(tx, event.organizationId));
      return runExport(event, context, dependencies, leadExportSource(dependencies, { timeZone }));
    },
  });
}
