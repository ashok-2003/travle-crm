// The console's switch that puts an agency on the lite WhatsApp agent (super admins only; the console's procedures
// check). A change is in the agency's own audit log (the ai module writes it) and once in the platform log.
import type { OrganizationLiteAgent, SetLiteAgentInput } from "@travel-crm/contracts/platform";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { autopilotOf, setLiteAgent } from "../ai/index.js";
import { DomainError, platformActor } from "../kernel/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Whether the lite agent is switched on for this agency (NOT_FOUND for an unknown organization). */
export async function organizationLiteAgent(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationLiteAgent> {
  return services.platformDb.transaction((tx) => liteOf(tx, organizationId));
}

/** Switches the lite agent on or off for one agency; asking for the state it is in changes and logs nothing. */
export async function setOrganizationLiteAgent(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetLiteAgentInput,
): Promise<OrganizationLiteAgent> {
  const { userId } = staff;
  if (userId === null) throw new RangeError("A switch names the admin who made it");
  const { organizationId, lite } = input;
  return services.platformDb.transaction(async (tx) => {
    await liteOf(tx, organizationId);
    const changed = await asOrganization(tx, organizationId, (orgTx) =>
      setLiteAgent(orgTx, platformActor(organizationId, userId), lite),
    );
    if (changed) {
      const entry = {
        targetType: "organization",
        targetId: organizationId,
        targetOrganizationId: organizationId,
        before: { lite: !lite },
        after: { lite },
      };
      // Each branch names its action as a literal, so the log's list of known actions can be held to them.
      if (lite) await recordPlatformAudit(tx, staff, { action: "ai-agent.lite-on", ...entry });
      else await recordPlatformAudit(tx, staff, { action: "ai-agent.lite-off", ...entry });
    }
    return { lite };
  });
}

async function liteOf(tx: PlatformTx, organizationId: string): Promise<OrganizationLiteAgent> {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (organization === null) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
  return asOrganization(tx, organizationId, async (orgTx) => ({ lite: (await autopilotOf(orgTx)).lite }));
}
