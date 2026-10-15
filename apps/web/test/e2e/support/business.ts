// The business profile a journey's agency starts with: what onboarding (plan 4) saves inside a new organization, its
// legal name, GSTIN, state and contact, written directly in the database as the fixtures write the rest; and a role
// of the agency's own, made by its Owner as the roles screen does.
import type { PlatformClient } from "@travel-crm/db/platform";
import type { Identity } from "@travel-crm/domain/identity";
import type { Agency } from "./fixtures";

/** Maharashtra's: the agency's GSTIN and state agree. */
export const ONBOARDED_GSTIN = "27AAPFU0939F1ZV";

/** A well-formed GSTIN of Karnataka, with its check character: another state's. */
export const KARNATAKA_GSTIN = "29AAPFU0939F1ZR";

export async function saveOnboardingProfile(
  platform: PlatformClient,
  organizationId: string,
  legalName: string,
): Promise<void> {
  await platform.organizationProfile.create({
    data: {
      organizationId,
      legalName,
      gstin: ONBOARDED_GSTIN,
      gstStateCode: "27",
      contactName: "Asha Sharma",
      contactPhone: "+919820012345",
    },
  });
}

/** A role with just these permissions, made by the agency's Owner. Returns its key, for addStaff. */
export async function addRole(
  database: { identity: Identity; platform: PlatformClient },
  agency: Agency,
  role: { name: string; permissions: string[] },
): Promise<string> {
  const user = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
  const owner = await database.identity.resolveAccess(user.id, agency.organizationId);
  if (!owner) throw new Error("the agency's owner has no access");
  const created = await database.identity.roles.create(owner, {
    name: role.name,
    permissions: role.permissions.map((permission) => ({ permission })),
  });
  return created.key;
}
