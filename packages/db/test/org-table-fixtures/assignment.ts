// Isolation fixtures for lead assignment (release C): the settings (one per organization), rules and pool members.
import { randomUUID } from "node:crypto";
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  assignment_settings: {
    // One for each organization, which its row-level default fills in.
    create: (tx) => tx.assignmentSettings.create({ data: {} }),
  },
  assignment_rule: {
    create: (tx) => tx.assignmentRule.create({ data: { position: 0, assigneeUserId: randomUUID() } }),
  },
  assignment_pool_member: {
    create: (tx) => tx.assignmentPoolMember.create({ data: { userId: randomUUID() } }),
  },
};
