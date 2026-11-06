// The throwaway organization the agent-cases command plays its test chats in: made like the demo's (the platform makes it,
// the platform purges it), with no staff and no subscription, so nothing of an agency's can reach it. The cases fill it.
import { randomBytes } from "node:crypto";
import { createOrganizationRecord } from "../identity/index.js";
import { purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

/** Makes the organization; its code is random, so two runs never meet. */
export async function createCaseOrganization(services: PlatformServices): Promise<string> {
  const code = `CASE${randomBytes(4).toString("hex").toUpperCase()}`;
  return services.platformDb.transaction(async (tx) => {
    const organization = await createOrganizationRecord(tx, {
      name: "Agent test chats",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    return organization.id;
  });
}

/** Removes it with everything the cases wrote, as the demo's reset removes last night's demo. */
export async function removeCaseOrganization(services: PlatformServices, organizationId: string): Promise<void> {
  await purgeOrganization(services, { organizationId, requestedBy: null }, { requireCancelled: false });
}
