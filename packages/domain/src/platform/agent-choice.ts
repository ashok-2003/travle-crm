// The console's choice of an agency's WhatsApp agent, lite or natural (super admins change it; the console's
// procedures check). The change goes in the agency's own audit log and in the platform log.
import type { ChooseAgentInput, OrganizationAgentChoice } from "@travel-crm/contracts/platform";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { agentOf, setAgent } from "../ai/index.js";
import { DomainError, platformActor } from "../kernel/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

const AGENT_CHOSEN = "ai-agent.agent-chosen";

/** An agency's agent, and its last replay once there are replays (none yet). NOT_FOUND for an unknown organization. */
export async function organizationAgentChoice(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationAgentChoice> {
  return services.platformDb.transaction(async (tx) => {
    await assertOrganization(tx, organizationId);
    const agent = await asOrganization(tx, organizationId, (orgTx) => agentOf(orgTx));
    return { agent, lastReplay: null, replaying: false };
  });
}

/** Moves an agency to the agent chosen; asking for the one it has changes and logs nothing. */
export async function chooseOrganizationAgent(
  services: PlatformServices,
  staff: PlatformActor,
  input: ChooseAgentInput,
): Promise<OrganizationAgentChoice> {
  const { userId } = staff;
  if (userId === null) throw new RangeError("A change of agent names the admin who made it");
  return services.platformDb.transaction(async (tx) => {
    await assertOrganization(tx, input.organizationId);
    const { before, changed } = await asOrganization(tx, input.organizationId, async (orgTx) => {
      const before = await agentOf(orgTx);
      const result = await setAgent(orgTx, platformActor(input.organizationId, userId), input.agent);
      return { before, changed: result.changed };
    });
    if (changed) {
      await recordPlatformAudit(tx, staff, {
        action: AGENT_CHOSEN,
        targetType: "organization",
        targetId: input.organizationId,
        targetOrganizationId: input.organizationId,
        before: { agent: before },
        after: { agent: input.agent },
      });
    }
    return { agent: input.agent, lastReplay: null, replaying: false };
  });
}

async function assertOrganization(tx: PlatformTx, id: string) {
  const found = await tx.organization.findUnique({ where: { id }, select: { id: true } });
  if (found === null) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
}
