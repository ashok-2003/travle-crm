// Isolation fixtures for what organizations do in the product: a page visit, how the organization began, and a member's
// seen welcome. The runtime role deletes none of them, and never changes a seen welcome.
import { randomUUID } from "node:crypto";
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  page_visit: {
    create: (tx) => tx.pageVisit.create({ data: { userId: randomUUID(), path: "/leads" } }),
    undeletable: true,
  },
  organization_welcome: { create: (tx) => tx.organizationWelcome.create({ data: { vip: true } }), undeletable: true },
  welcome_seen: { create: (tx) => tx.welcomeSeen.create({ data: { userId: randomUUID() } }), appendOnly: true },
};
