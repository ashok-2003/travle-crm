// The worker's side of sales execution: on a new lead, the greeting and the follow-ups enrolled (sales.greet-new-lead);
// each minute, for every agency with a WhatsApp number, its due follow-ups and payment reminders. One agency failing
// never stops the rest.
import { leadCreatedEvent } from "@travel-crm/contracts/crm";
import type { Logger } from "@travel-crm/integrations/logging";
import { routesPage } from "../inbox/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { greetNewLead, type CadenceDependencies } from "./cadence.js";
import { runSalesDueWorkFor, type ReminderDependencies } from "./reminders.js";

/** The queue of the minute's sales work. */
export const SALES_DUE_WORK_QUEUE = "sales.due-work";

export function greetNewLeadListener(dependencies: CadenceDependencies): EventListener {
  return defineListener({
    name: "sales.greet-new-lead",
    eventType: "lead.created",
    payload: leadCreatedEvent,
    handle: async (event) => {
      await greetNewLead(
        dependencies,
        { organizationId: event.organizationId, leadId: event.payload.leadId },
        new Date(),
      );
    },
  });
}

export async function runSalesDueWork(
  dependencies: ReminderDependencies & { logger: Logger },
  now: Date,
): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const route of page) {
      try {
        done += await runSalesDueWorkFor(dependencies, route.organizationId, now);
      } catch (error) {
        dependencies.logger.error(
          { connectionId: route.connectionId, error: error instanceof Error ? error.name : "unknown" },
          "The sales due work failed for an agency",
        );
      }
    }
    if (page.length < 100) return done;
    after = page.at(-1)?.integratedNumber;
  }
}
