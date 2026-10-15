// The profile module as the api uses it: one organization's business profile, read and saved in that
// organization's own transaction.
import type {
  OrganizationProfileDetails,
  SaveBrandingInput,
  SaveOrganizationProfileInput,
  UpdateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";
import type { Database } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import {
  getOrganizationProfile,
  saveOrganizationBranding,
  saveOrganizationProfile,
  updateOrganizationProfile,
} from "./profile.js";

export interface Profiles {
  /** The organization's profile, or null before one was saved. */
  get(organizationId: string): Promise<OrganizationProfileDetails | null>;
  /** Saves the whole profile in the actor's organization. The API checks settings:manage first. */
  save(actor: Actor, input: SaveOrganizationProfileInput): Promise<OrganizationProfileDetails>;
  /** Saves the business details, leaving the branding as it was. */
  update(actor: Actor, input: UpdateOrganizationProfileInput): Promise<OrganizationProfileDetails>;
  /** Saves the branding, leaving the business details as they were. Fails with PROFILE_NOT_SAVED before onboarding. */
  saveBranding(actor: Actor, input: SaveBrandingInput): Promise<OrganizationProfileDetails>;
}

export function createProfiles(dependencies: { db: Pick<Database, "forOrg"> }): Profiles {
  const { db } = dependencies;
  return {
    get: (organizationId) => db.forOrg(organizationId, (tx) => getOrganizationProfile(tx, organizationId)),
    save: (actor, input) => db.forOrg(actor.organizationId, (tx) => saveOrganizationProfile(tx, actor, input)),
    update: (actor, input) => db.forOrg(actor.organizationId, (tx) => updateOrganizationProfile(tx, actor, input)),
    saveBranding: (actor, input) => db.forOrg(actor.organizationId, (tx) => saveOrganizationBranding(tx, actor, input)),
  };
}
