// Changing a staff member's phone (B51): the same checks as any change to a member, a lock on the member while it is
// written, and an audit entry that says a phone changed but never what it is.
import type { ChangeStaffPhoneInput, StaffMember } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { assertMayManageMember } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { findCurrentRole } from "./role-lookup.js";
import { findMember, staffMember } from "./staff.js";
import { lockMember, staffChanged } from "./staff-locks.js";

export async function changeStaffPhone(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: ChangeStaffPhoneInput,
): Promise<StaffMember> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    const targetRole = await findCurrentRole(tx, target.role);
    assertMayManageMember(actor, { userId: target.userId, role: targetRole });
    await lockMember(tx, target);
    const { count } = await tx.member.updateMany({
      where: { id: target.id, role: target.role, deletedAt: null },
      data: { phoneE164: input.phone },
    });
    if (count !== 1) throw staffChanged();
    await recordAudit(tx, actor, {
      action: "staff.phone-changed",
      entityType: "member",
      entityId: target.id,
      after: { hasPhone: input.phone !== null },
    });
  });
  return staffMember(database, actor, input.memberId);
}
