// An organization's members as the console lists them (spec 6.1): whom support may impersonate, and an Owner still to
// choose a password from their invite. Identity reads its own tables, inside the organization.
import type { OrganizationMember } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { findOrganizationRecord, organizationMembers } from "../identity/index.js";
import type { PlatformServices } from "./services.js";

/** The organization's active members, oldest first; ORGANIZATION_NOT_FOUND for one that doesn't exist. */
export async function listOrganizationMembers(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationMember[]> {
  return services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, organizationId);
    const members = await asOrganization(tx, organizationId, (orgTx) => organizationMembers(orgTx, organizationId));
    return members.map((member) => ({ ...member, lastActiveAt: member.lastActiveAt?.toISOString() ?? null }));
  });
}
