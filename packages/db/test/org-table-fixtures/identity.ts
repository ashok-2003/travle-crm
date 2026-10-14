// Isolation fixtures for the identity module's role tables.
import type { OrgTableFixtures } from "../org-table-fixture.js";

export const fixtures: OrgTableFixtures = {
  // The runtime role may update a role's name, not its organization_id (migration runtime_column_grants).
  role: {
    create: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
    updatableColumn: "name",
  },
  role_permission: {
    create: async (tx) => {
      const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
      return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
    },
  },
};
