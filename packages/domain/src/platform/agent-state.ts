// What the console reads of an agency's AI agent: whether the agency turned it on, which required setup steps are
// still undone, and whether it is ready to answer. A pause is read apart (ai-agent-pause.ts).
import type { OrganizationAgentState } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { agentSetupOf, aiEnabled, autopilotOf } from "../ai/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
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
    return asOrganization(tx, organizationId, async (orgTx) => {
      const settings = await autopilotOf(orgTx);
      // The agent answers only with the agency's AI module and its own switch on.
      const on = settings.autopilot && (await aiEnabled(orgTx));
      const setup = await agentSetupOf(orgTx, organizationId, today);
      const missing = setup.steps.filter((step) => !step.optional && !step.done).map((step) => step.key);
      return { on, missing, answering: on && setup.ready };
    });
  });
}
