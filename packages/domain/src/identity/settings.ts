// The organization setting the identity module owns: whether every member must use two-factor sign-in (spec 6.2).
// The API checks settings:manage before calling setTwoFactorRequirement.
import type { SecuritySettings, SetTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";

export async function setTwoFactorRequirement(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: SetTwoFactorRequirementInput,
): Promise<SecuritySettings> {
  // Otherwise the person turning it on would be shut out of the app until they set it up.
  if (input.required && !actor.twoFactorEnabled) {
    throw new DomainError("FORBIDDEN", "ENABLE_TWO_FACTOR_FIRST", "Turn on two-factor sign-in for yourself first");
  }
  const organization = await database.forOrg(actor.organizationId, (tx) =>
    tx.organization.update({ where: { id: actor.organizationId }, data: { requireTwoFactor: input.required } }),
  );
  return { requireTwoFactor: organization.requireTwoFactor };
}
