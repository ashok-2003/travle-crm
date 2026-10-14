// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
  role: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
  role_permission: async (tx) => {
    const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
    return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
  },
};

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4): Better Auth's member and invitation. Only the identity module may touch
 * them. identity-tables.test.ts checks each entry exists and is one of those two, so no other table can be exempted.
 */
export const signInTables: readonly string[] = ["invitation", "member"];
