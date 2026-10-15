// Gives a new organization its five starter roles. Onboarding calls this right after creating the organization, inside
// its own transaction, stepped into the new organization.
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { starterRoles } from "./starter-roles.js";

export async function seedStarterRoles(database: IdentityDatabase, organizationId: string): Promise<void> {
  await database.forOrg(organizationId, insertStarterRoles);
}

/** The starter roles, in the transaction's organization (db.forOrg(), or the platform's asOrganization()). */
export async function insertStarterRoles(tx: IdentityTx): Promise<void> {
  if ((await tx.role.count()) > 0) {
    throw new DomainError("CONFLICT", "ROLES_ALREADY_SEEDED", "This organization already has roles");
  }
  for (const starter of starterRoles) {
    const role = await tx.role.create({ data: { key: starter.key, name: starter.name, isOwner: starter.isOwner } });
    await tx.rolePermission.createMany({
      data: starter.grants.map((grant) => ({ roleId: role.id, permission: grant.permission, scope: grant.scope })),
    });
  }
}
