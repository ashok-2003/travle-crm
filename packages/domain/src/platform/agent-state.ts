// What the console reads of an agency's AI agent: whether the agency turned it on, which required setup steps are
// still undone, whether its plan has the AI, and whether it is ready to answer. A pause is read apart
// (ai-agent-pause.ts).
import type { OrganizationAgentState } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { agentSetupOf, aiAllowed, aiEnabled, autopilotOf } from "../ai/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
import { entitlementsOf } from "../subscriptions/index.js";
import type { PlatformServices } from "./services.js";

/**
 * The agent's state for one agency (NOT_FOUND for an unknown organization). `now` decides the agency's day, which the
 * setup's departures are read against.
 */
export async function organizationAgentState(
  services: PlatformServices,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationAgentState> {
  return services.platformDb.transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { timeZone: true },
    });
    if (organization === null) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
    const today = calendarDateIn(now, organization.timeZone);
    // The plan and the subscription, as every turn reads them first: a plan that lost the AI leaves the agency's own
    // switch as it was, so the switch alone would read "ready" for an agent whose every turn ends not_allowed.
    const entitlements = await entitlementsOf(tx, organizationId, now);
    return asOrganization(tx, organizationId, async (orgTx) => {
      const settings = await autopilotOf(orgTx);
      // The agent answers only with the agency's AI module and its own switch on.
      const on = settings.autopilot && (await aiEnabled(orgTx));
      const setup = await agentSetupOf(orgTx, organizationId, today);
      const missing = setup.steps.filter((step) => !step.optional && !step.done).map((step) => step.key);
      return {
        on,
        missing,
        planHasAi: entitlements?.modules.has("ai") === true,
        answering: aiAllowed(entitlements) && on && setup.ready,
      };
    });
  });
}
