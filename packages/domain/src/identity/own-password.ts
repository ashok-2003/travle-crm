// An invited Owner's own password (the invite program, the owner, 2026-10-28): they came in through their link with a
// password the platform made and never saw, so they choose their own without being asked for one they don't know.
// Only while the account still carries the platform's password (the temporary stamp, with no change asked of them,
// which an admin's temporary password always asks); once chosen, the invite link signs them in no more.
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "./member-access.js";
import { TEMPORARY_PASSWORD_STAMP, type PasswordHasher } from "./staff-accounts.js";

async function platformMade(tx: IdentityTx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } });
  if (user === null || user.mustChangePassword) return false;
  const account = await tx.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { updatedAt: true },
  });
  return account?.updatedAt.getTime() === TEMPORARY_PASSWORD_STAMP.getTime();
}

/** Whether the signed-in person still signs in with the password the platform made: they have their own to choose. */
export async function hasOwnPasswordToChoose(database: IdentityDatabase, actor: MemberAccess): Promise<boolean> {
  if (actor.impersonatedBy !== null) return false;
  return database.forOrg(actor.organizationId, (tx) => platformMade(tx, actor.userId));
}

/** Their own password, in place of the platform's; false when they have one already (it is never overwritten here). */
export async function chooseOwnPassword(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  actor: MemberAccess,
  password: string,
): Promise<{ chosen: boolean }> {
  if (actor.impersonatedBy !== null) return { chosen: false };
  // Hashing is slow on purpose: before the transaction, never inside it.
  const passwordHash = await hashPassword(password);
  return database.forOrg(actor.organizationId, async (tx) => {
    // The credential row is held, so the invite link renewing the platform's password can't land between.
    await tx.$queryRaw`SELECT id FROM account WHERE user_id = ${actor.userId}::uuid AND provider_id = 'credential' FOR UPDATE`;
    if (!(await platformMade(tx, actor.userId))) return { chosen: false };
    await tx.account.updateMany({
      where: { userId: actor.userId, providerId: "credential" },
      data: { password: passwordHash, updatedAt: new Date() },
    });
    await recordAudit(tx, actor, { action: "staff.password-chosen", entityType: "member", entityId: actor.memberId });
    return { chosen: true };
  });
}
