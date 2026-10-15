// Isolation fixtures for the profile module: an organization's business profile. The runtime role may change its
// fields, not move it or delete it.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  organization_profile: {
    create: (tx) => tx.organizationProfile.create({ data: { legalName: "Isolation Travels", gstStateCode: "27" } }),
    appendOnly: true,
    updatableColumn: "legal_name",
  },
};
