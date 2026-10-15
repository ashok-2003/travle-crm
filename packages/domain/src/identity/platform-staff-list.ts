// The platform staff list (spec 5): everyone with a level, and everyone removed from platform staff, whose rows stay.
// Read in the console's platform transaction; the platform module adds when each removal happened, from its log.
import type { PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { withDeleted } from "@travel-crm/db";
import type { IdentityTx } from "@travel-crm/db/identity";
import { platformStaffLevelOf, platformStaffRoles } from "./access.js";
import { REMOVED_FROM_PLATFORM_STAFF } from "./platform-staff.js";

export interface PlatformStaffAccount {
  userId: string;
  name: string;
  email: string;
  /** Null once removed. */
  level: PlatformStaffLevel | null;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
}

/** Oldest first. Anyone who is or was a member is left out, whatever their role says: they are no platform staff. */
export async function platformStaffAccounts(tx: IdentityTx): Promise<PlatformStaffAccount[]> {
  const users = await tx.user.findMany({
    where: { OR: [{ role: { in: Object.values(platformStaffRoles) } }, { banReason: REMOVED_FROM_PLATFORM_STAFF }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const members = await withDeleted(() =>
    tx.member.findMany({ where: { userId: { in: users.map((user) => user.id) } }, select: { userId: true } }),
  );
  const everMembers = new Set(members.map((member) => member.userId));
  return users
    .filter((user) => !everMembers.has(user.id))
    .map((user) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      level: platformStaffLevelOf(user.role),
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      createdAt: user.createdAt,
    }));
}
