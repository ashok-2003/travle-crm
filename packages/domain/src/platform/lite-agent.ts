// The console's switch that puts an agency on the lite WhatsApp agent (super admins only; the console's procedures
// check), and whether the agent answers there now. A change is in the agency's own audit log (the ai module writes it)
// and once in the platform log.
import type { OrganizationLiteAgent, SetLiteAgentInput } from "@travel-crm/contracts/platform";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { agentSetupOf, aiEnabled, autopilotOf, setLiteAgent } from "../ai/index.js";
import { calendarDateIn, DomainError, platformActor } from "../kernel/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/**
 * Whether the lite agent is switched on for this agency, and whether it answers now (NOT_FOUND for an unknown
 * organization). `now` decides the agency's day, which the setup's departures are read against.
 */
export async function organizationLiteAgent(
  services: PlatformServices,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationLiteAgent> {
  return services.platformDb.transaction((tx) => liteOf(tx, organizationId, now));
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
    await liteOf(tx, organizationId, new Date());
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
    return liteOf(tx, organizationId, new Date());
  });
}

async function liteOf(tx: PlatformTx, organizationId: string, now: Date): Promise<OrganizationLiteAgent> {
  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, timeZone: true },
  });
  if (organization === null) throw new DomainError("NOT_FOUND", "ORGANIZATION_NOT_FOUND", "No such organization");
  const today = calendarDateIn(now, organization.timeZone);
  return asOrganization(tx, organizationId, async (orgTx) => {
    const settings = await autopilotOf(orgTx);
    // The switch alone answers nothing: the turn also needs the agency's AI and agent on, and its setup ready.
    const on = settings.lite && settings.autopilot && (await aiEnabled(orgTx));
    const answering = on && (await agentSetupOf(orgTx, organizationId, today)).ready;
    return { lite: settings.lite, answering };
  });
}
