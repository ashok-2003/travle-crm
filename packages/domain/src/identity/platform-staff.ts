// Platform staff's accounts and levels (spec 5, 6.1), written by our own code in the caller's platform transaction,
// never through Better Auth's admin API, which stays closed over HTTP (ADR 0019). Every change takes one lock first and
// checks everything after it, so changes take turns: two super admins demoting each other, or two first-run commands,
// each see what the other did. Nobody who is or was a member of an organization ever gets a level.
import { randomBytes } from "node:crypto";
import type { PlatformStaffLevel } from "@travel-crm/contracts/platform";
import { isUniqueViolation, type IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { describePlatformStaff, hasEverBeenMember, platformStaffRoles } from "./access.js";
import { endPlatformStaffSessions, type EndedImpersonation } from "./platform-staff-sessions.js";

/** Better Auth's ban reason for someone removed from platform staff: the row stays, so the logs' ids lead somewhere. */
export const REMOVED_FROM_PLATFORM_STAFF = "Removed from platform staff";

/** Who changes platform staff: a super admin, checked again under the lock. */
export interface PlatformStaffActor {
  readonly userId: string;
}

/** A newcomer, with the hash of the temporary password they must replace at first sign-in. */
export interface NewPlatformStaff {
  name: string;
  email: string;
  level: PlatformStaffLevel;
  passwordHash: string;
}

/** A temporary password: 24 characters from 18 random bytes, shown once to the person who passes it on. */
export function temporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

export async function createPlatformStaffAccount(
  tx: IdentityTx,
  actor: PlatformStaffActor,
  staff: NewPlatformStaff,
): Promise<{ userId: string }> {
  await lockPlatformStaff(tx);
  await assertSuperAdmin(tx, actor);
  return insertAccount(tx, staff);
}

/** The first super admin, made by the one-off command: refused once any super admin exists. */
export async function createFirstSuperAdmin(
  tx: IdentityTx,
  staff: Omit<NewPlatformStaff, "level">,
): Promise<{ userId: string }> {
  await lockPlatformStaff(tx);
  // Any super admin at all, one who hasn't chosen a password yet included: this command makes the first one only.
  if ((await superAdmins(tx, { besides: null, readyOnly: false })) > 0) {
    throw new DomainError(
      "CONFLICT",
      "SUPER_ADMIN_EXISTS",
      "A super admin exists already: they add everyone else from the console.",
    );
  }
  return insertAccount(tx, { ...staff, level: "super-admin" });
}

/** Promotes or demotes. A demoted super admin keeps their impersonations: support may impersonate. */
export async function changePlatformStaffLevel(
  tx: IdentityTx,
  actor: PlatformStaffActor,
  input: { userId: string; level: PlatformStaffLevel },
): Promise<{ before: PlatformStaffLevel }> {
  await lockPlatformStaff(tx);
  await assertSuperAdmin(tx, actor);
  if (await hasEverBeenMember(tx, input.userId)) throw everAMember();
  const before = await levelOf(tx, input.userId);
  if (before === "super-admin" && input.level !== "super-admin") await assertAnotherSuperAdmin(tx, input.userId);
  if (before !== input.level) {
    await tx.user.update({ where: { id: input.userId }, data: { role: platformStaffRoles[input.level] } });
  }
  return { before };
}

/**
 * Ends the person's platform access at once: no level (describePlatformStaff reads the role), banned, and their sessions
 * and the impersonations they started deleted, so the api's per-request check refuses the impersonated member's next
 * request. The row and its address stay: the logs' ids still resolve, and the address can't be added again.
 */
export async function removeFromPlatformStaff(
  tx: IdentityTx,
  actor: PlatformStaffActor,
  userId: string,
): Promise<{ before: PlatformStaffLevel; endedImpersonations: EndedImpersonation[] }> {
  await lockPlatformStaff(tx);
  await assertSuperAdmin(tx, actor);
  const before = await levelOf(tx, userId);
  if (before === "super-admin") await assertAnotherSuperAdmin(tx, userId);
  await tx.user.update({
    where: { id: userId },
    data: { role: null, banned: true, banReason: REMOVED_FROM_PLATFORM_STAFF, banExpires: null },
  });
  return { before, endedImpersonations: await endPlatformStaffSessions(tx, userId) };
}

/**
 * A new temporary password, to replace at the next sign-in, and every session ended: theirs and the impersonations
 * they started, since whoever had the old password may be using it.
 */
export async function replacePlatformStaffPassword(
  tx: IdentityTx,
  actor: PlatformStaffActor,
  input: { userId: string; passwordHash: string },
): Promise<{ endedImpersonations: EndedImpersonation[] }> {
  await lockPlatformStaff(tx);
  await assertSuperAdmin(tx, actor);
  await levelOf(tx, input.userId);
  const { count } = await tx.account.updateMany({
    where: { userId: input.userId, providerId: "credential" },
    data: { password: input.passwordHash },
  });
  if (count !== 1) throw new Error(`Expected one credential account for user ${input.userId}, found ${String(count)}`);
  await tx.user.update({ where: { id: input.userId }, data: { mustChangePassword: true } });
  return { endedImpersonations: await endPlatformStaffSessions(tx, input.userId) };
}

/** Held until the transaction ends. One fixed key: every change to platform staff waits for the one before it. */
async function lockPlatformStaff(tx: IdentityTx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-staff', 0))`;
}

/** The actor checked again, under the lock: a demotion or removal since the request was let in counts. */
async function assertSuperAdmin(tx: IdentityTx, actor: PlatformStaffActor): Promise<void> {
  if ((await describePlatformStaff(tx, actor.userId))?.level !== "super-admin") {
    throw new DomainError("FORBIDDEN", "SUPER_ADMIN_ONLY", "Only a super admin can do this");
  }
}

/** The level of someone on the platform staff now. Anyone else, removed staff and members included, isn't found. */
async function levelOf(tx: IdentityTx, userId: string): Promise<PlatformStaffLevel> {
  const staff = await describePlatformStaff(tx, userId);
  if (!staff) throw new DomainError("NOT_FOUND", "STAFF_NOT_FOUND", "No such person on the platform staff");
  return staff.level;
}

/**
 * Another super admin must be able to act now: one still to replace a temporary password counts for nothing yet, so a
 * super admin can't add one and leave, handing the platform to someone who may never sign in.
 */
async function assertAnotherSuperAdmin(tx: IdentityTx, userId: string): Promise<void> {
  if ((await superAdmins(tx, { besides: userId, readyOnly: true })) === 0) {
    throw new DomainError("CONFLICT", "LAST_SUPER_ADMIN", "The platform must keep a super admin");
  }
}

/**
 * Super admins other than `besides` who can still sign in: not banned, and never a member (removed ones included).
 * `readyOnly` leaves out those with a temporary password still to replace.
 */
async function superAdmins(tx: IdentityTx, filter: { besides: string | null; readyOnly: boolean }): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "user" u
    WHERE u.role = ${platformStaffRoles["super-admin"]} AND u.id IS DISTINCT FROM ${filter.besides}::uuid
      AND (u.banned IS NOT TRUE OR u.ban_expires <= now())
      AND NOT (${filter.readyOnly}::boolean AND u.must_change_password)
      AND NOT EXISTS (SELECT 1 FROM member m WHERE m.user_id = u.id)`;
  return row?.n ?? 0;
}

/**
 * A user with a level, a temporary password and no membership. Refused for an address in use, and for anyone who is
 * or was a member under it: their address now, or the one they had before they were removed (ADR 0007).
 */
async function insertAccount(tx: IdentityTx, staff: NewPlatformStaff): Promise<{ userId: string }> {
  const holders = await tx.user.findMany({
    where: { OR: [{ email: staff.email }, { formerEmail: staff.email }] },
    select: { id: true, email: true },
  });
  for (const holder of holders) if (await hasEverBeenMember(tx, holder.id)) throw everAMember();
  if (holders.some((holder) => holder.email === staff.email)) throw emailTaken();
  try {
    const user = await tx.user.create({
      data: { name: staff.name, email: staff.email, role: platformStaffRoles[staff.level], mustChangePassword: true },
      select: { id: true },
    });
    // Better Auth's password sign-in reads the "credential" account whose accountId is the user id.
    await tx.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: staff.passwordHash },
    });
    return { userId: user.id };
  } catch (error) {
    // An organization's admin took the address meanwhile: their staff changes don't take this lock.
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }
}

function everAMember(): DomainError {
  return new DomainError("CONFLICT", "EVER_A_MEMBER", "A member, past or present, can't be platform staff");
}

function emailTaken(): DomainError {
  return new DomainError("CONFLICT", "STAFF_EMAIL_TAKEN", "Someone already has this email address");
}
