// The business profile a journey's agency starts with: what onboarding (plan 4) saves inside a new organization, its
// legal name, GSTIN, state and contact, written directly in the database as the fixtures write the rest.
import type { PlatformClient } from "@travel-crm/db/platform";

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
