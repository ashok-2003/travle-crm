// The worker's loop over agencies that may still change things (a subscription with full access), a page at a time, for the
// scheduled jobs of the business modules. One agency failing is logged by name of its error only, and never stops the rest.
import type { Logger } from "@travel-crm/integrations/logging";
import type { Identity } from "../identity/index.js";
import type { SubscriptionAccess } from "./entitlements.js";

const PAGE = 100;

export interface AgencyLoopDependencies {
  identity: Pick<Identity, "organizationsPage">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  logger: Logger;
}

export type Agency = Awaited<ReturnType<Identity["organizationsPage"]>>[number];

/** Runs `work` for each agency with full access and adds up what it returns (a count of things done). */
export async function forEachFullAccessAgency(
  dependencies: AgencyLoopDependencies,
  failureMessage: string,
  work: (agency: Agency) => Promise<number>,
): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await dependencies.identity.organizationsPage({ after, limit: PAGE });
    for (const agency of page) {
      try {
        const entitlements = await dependencies.subscriptions.entitlementsOf(agency.id);
        if (entitlements?.access !== "full") continue;
        done += await work(agency);
      } catch (error) {
        dependencies.logger.error(
          { organizationId: agency.id, error: error instanceof Error ? error.name : "unknown" },
          failureMessage,
        );
      }
    }
    if (page.length < PAGE) return done;
    after = page.at(-1)?.id;
  }
}
