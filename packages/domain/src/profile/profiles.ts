// The profile module as the api uses it: one organization's business profile, read and saved in that
// organization's own transaction.
import type { OrganizationProfileDetails, SaveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import type { Database } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { getOrganizationProfile, saveOrganizationProfile } from "./profile.js";

export interface Profiles {
  /** The organization's profile, or null before one was saved. */
  get(organizationId: string): Promise<OrganizationProfileDetails | null>;
  /** Saves the whole profile in the actor's organization. The API checks settings:manage first. */
  save(actor: Actor, input: SaveOrganizationProfileInput): Promise<OrganizationProfileDetails>;
}

export function createProfiles(dependencies: { db: Pick<Database, "forOrg"> }): Profiles {
  const { db } = dependencies;
  return {
    get: (organizationId) => db.forOrg(organizationId, getOrganizationProfile),
    save: (actor, input) => db.forOrg(actor.organizationId, (tx) => saveOrganizationProfile(tx, actor, input)),
  };
}
