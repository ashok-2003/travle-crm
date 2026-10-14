// The organization setting the identity module owns: whether every member must use two-factor sign-in (spec 6.2).
// The API checks settings:manage before calling setTwoFactorRequirement.
import type { SecuritySettings, SetTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";

export async function setTwoFactorRequirement(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: SetTwoFactorRequirementInput,
): Promise<SecuritySettings> {
  // Spec 6.2: an Owner can require two-factor. Anyone with settings:manage may tighten sign-in; only an Owner loosens it.
  if (!input.required && !actor.role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner can stop requiring two-factor sign-in");
  }
  // Otherwise the person turning it on would be shut out of the app until they set it up.
  if (input.required && !actor.twoFactorEnabled) {
    throw new DomainError("FORBIDDEN", "ENABLE_TWO_FACTOR_FIRST", "Turn on two-factor sign-in for yourself first");
  }
  await database.forOrg(actor.organizationId, async (tx) => {
    // Conditional on the other value, so of two members changing it at once only the write that really changes it
    // counts and is recorded, and each entry starts where the one before it ended.
    const { count } = await tx.organization.updateMany({
      where: { id: actor.organizationId, requireTwoFactor: !input.required },
      data: { requireTwoFactor: input.required },
    });
    if (count === 1) {
      await recordAudit(tx, actor, {
        action: "settings.two-factor-requirement-changed",
        entityType: "organization",
        entityId: actor.organizationId,
        before: { requireTwoFactor: !input.required },
        after: { requireTwoFactor: input.required },
      });
    }
  });
  return { requireTwoFactor: input.required };
}
