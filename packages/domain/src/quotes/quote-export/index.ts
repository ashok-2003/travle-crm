// The quotes export's listener (bookings revamp, 2026-11-27): the Quotes list as the person sees it into a file, through
// runExport, with the agency's time zone for the file's times and its name. `paymentWaits` is the ai module's
// paymentWaitsOf, which the worker hands in (quotes sit below the ai module). Another kind's export is left to its own
// listener (runExport acts only on its source's kind).
import { exportRequestedEvent } from "@travel-crm/contracts/exports";
import { runExport, type ExportJobDependencies } from "../../exports/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import { defineListener, type EventListener } from "../../jobs/index.js";
import { quoteExportSource, type PaymentWaits } from "./quote-export-source.js";

export type { PaymentWaits } from "./quote-export-source.js";

export function makeQuoteExportListener(
  dependencies: ExportJobDependencies,
  paymentWaits: PaymentWaits,
): EventListener {
  return defineListener({
    name: "quotes.make-quote-export",
    eventType: "export.requested",
    payload: exportRequestedEvent,
    handle: async (event, context) => {
      if (event.payload.kind !== "quotes") return;
      const timeZone = await context.forOrg((tx) => organizationTimeZone(tx, event.organizationId));
      return runExport(event, context, dependencies, quoteExportSource(dependencies, { timeZone, paymentWaits }));
    },
  });
}
