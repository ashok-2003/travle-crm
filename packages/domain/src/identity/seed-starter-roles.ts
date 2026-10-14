// Gives a new organization its five starter roles. Onboarding (plan 4) calls this right after creating the organization.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { starterRoles } from "./starter-roles.js";

export async function seedStarterRoles(database: IdentityDatabase, organizationId: string): Promise<void> {
  await database.forOrg(organizationId, async (tx) => {
    if ((await tx.role.count()) > 0) {
      throw new DomainError("CONFLICT", "ROLES_ALREADY_SEEDED", "This organization already has roles");
    }
    for (const starter of starterRoles) {
      const role = await tx.role.create({ data: { key: starter.key, name: starter.name, isOwner: starter.isOwner } });
      await tx.rolePermission.createMany({
        data: starter.grants.map((grant) => ({ roleId: role.id, permission: grant.permission, scope: grant.scope })),
      });
    }
  });
}
