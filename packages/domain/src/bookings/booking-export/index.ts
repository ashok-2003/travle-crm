// The bookings export's listener (bookings revamp, 2026-11-27): the Bookings list as the person sees it into a file,
// through runExport, with the agency's time zone for what is overdue and the file's name. Another kind's export is left
// to its own listener (runExport acts only on its source's kind).
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { runExport, type ExportJobDependencies } from "../../exports/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";
import { bookingExportSource } from "./booking-export-source.js";

export function makeBookingExportListener(dependencies: ExportJobDependencies): EventListener {
  return defineListener({
    name: "bookings.make-booking-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "bookings") return;
      const timeZone = await context.forOrg((tx) => organizationTimeZone(tx, event.organizationId));
      return runExport(event, context, dependencies, bookingExportSource(dependencies, { timeZone }));
    },
  });
}
