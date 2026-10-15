// Platform staff from the console (spec 5, 6.1), super admins only, and the first super admin from a one-off command.
// Identity writes the levels itself, under its platform staff lock, in the same platform transaction as the platform
// log's entry, which holds ids and levels only: never a name, an address or a password. A temporary password is in
// the function's result alone, for the one response or terminal it is shown in. An impersonation a removal or a new
// password ends is recorded in its member's organization's log, as a stop through Better Auth is.
import type {
  AddedPlatformStaff,
  AddPlatformStaffInput,
  PlatformStaffEntry,
  SetPlatformStaffLevelInput,
  TemporaryPasswordOutput,
} from "@travel-crm/contracts/platform";
import { asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { recordAudit } from "../audit/index.js";
import {
  changePlatformStaffLevel,
  createFirstSuperAdmin,
  createPlatformStaffAccount,
  platformStaffAccounts,
  removeFromPlatformStaff,
  replacePlatformStaffPassword,
  temporaryPassword,
  type EndedImpersonation,
  type PlatformStaffActor,
} from "../identity/index.js";
import { platformActor } from "../kernel/index.js";
import { hashPassword } from "./password-hash.js";
import { recordPlatformAudit, type PlatformActor, type PlatformChange } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

const REMOVED = "platform-staff.removed";

/** Everyone on the platform staff, and everyone removed from it with when that was, oldest first. */
export async function listPlatformStaff(services: PlatformServices): Promise<PlatformStaffEntry[]> {
  return services.platformDb.transaction(async (tx) => {
    const accounts = await platformStaffAccounts(tx);
    const removedIds = accounts.filter((account) => account.level === null).map((account) => account.userId);
    const removals = await tx.platformAuditEntry.findMany({
      where: { action: REMOVED, targetType: "platform_staff", targetId: { in: removedIds } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { targetId: true, occurredAt: true },
    });
    const removedAt = new Map(removals.map((removal) => [removal.targetId, removal.occurredAt.toISOString()]));
    return accounts.map((account) => ({
      ...account,
      createdAt: account.createdAt.toISOString(),
      removedAt: account.level === null ? (removedAt.get(account.userId) ?? null) : null,
    }));
  });
}

/** Support or a super admin, with a temporary password returned once, which they replace before the console opens. */
export async function addPlatformStaff(
  services: PlatformServices,
  staff: PlatformStaffActor,
  input: AddPlatformStaffInput,
): Promise<AddedPlatformStaff> {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(services, password);
  const { userId } = await services.platformDb.transaction(async (tx) => {
    const created = await createPlatformStaffAccount(tx, staff, { ...input, passwordHash });
    await record(tx, staff, {
      action: "platform-staff.added",
      targetId: created.userId,
      after: { level: input.level },
    });
    return created;
  });
  return { userId, temporaryPassword: password };
}

/** The one-off command's work (apps/api's `first-super-admin`): refused once any super admin exists. */
export async function addFirstSuperAdmin(
  services: PlatformServices,
  input: { name: string; email: string },
): Promise<AddedPlatformStaff> {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(services, password);
  const { userId } = await services.platformDb.transaction(async (tx) => {
    const created = await createFirstSuperAdmin(tx, { ...input, passwordHash });
    // No one in the console acts: the operator ran the command.
    const change = { action: "platform-staff.added", targetId: created.userId, after: { level: "super-admin" } };
    await record(tx, { userId: null }, change);
    return created;
  });
  return { userId, temporaryPassword: password };
}

export async function setPlatformStaffLevel(
  services: PlatformServices,
  staff: PlatformStaffActor,
  input: SetPlatformStaffLevelInput,
): Promise<void> {
  await services.platformDb.transaction(async (tx) => {
    const { before } = await changePlatformStaffLevel(tx, staff, input);
    if (before === input.level) return;
    const change = { action: "platform-staff.level-changed", targetId: input.userId };
    await record(tx, staff, { ...change, before: { level: before }, after: { level: input.level } });
  });
}

export async function removePlatformStaff(
  services: PlatformServices,
  staff: PlatformStaffActor,
  input: { userId: string },
): Promise<void> {
  await services.platformDb.transaction(async (tx) => {
    const { before, endedImpersonations } = await removeFromPlatformStaff(tx, staff, input.userId);
    await record(tx, staff, { action: REMOVED, targetId: input.userId, before: { level: before } });
    await recordStops(tx, staff, endedImpersonations, "removed-from-platform-staff");
  });
}

/** A new temporary password, returned once. Platform staff may also reset their own by email, like anyone. */
export async function resetPlatformStaffPassword(
  services: PlatformServices,
  staff: PlatformStaffActor,
  input: { userId: string },
): Promise<TemporaryPasswordOutput> {
  const password = temporaryPassword();
  const passwordHash = await hashPassword(services, password);
  await services.platformDb.transaction(async (tx) => {
    const { endedImpersonations } = await replacePlatformStaffPassword(tx, staff, {
      userId: input.userId,
      passwordHash,
    });
    await record(tx, staff, { action: "platform-staff.password-reset", targetId: input.userId });
    await recordStops(tx, staff, endedImpersonations, "password-reset");
  });
  return { temporaryPassword: password };
}

/**
 * "support.impersonation-stopped" in each member's organization's log, as Better Auth's stop endpoint writes it, so its
 * staff see the impersonation end. The super admin who ended it acts, from the console; the impersonating admin and
 * the reason are in the entry.
 */
async function recordStops(
  tx: PlatformTx,
  staff: PlatformStaffActor,
  ended: readonly EndedImpersonation[],
  reason: "removed-from-platform-staff" | "password-reset",
): Promise<void> {
  for (const { organizationId, memberId, userId, adminUserId, expiresAt } of ended) {
    await asOrganization(tx, organizationId, (orgTx) =>
      recordAudit(orgTx, platformActor(organizationId, staff.userId), {
        action: "support.impersonation-stopped",
        entityType: "member",
        entityId: memberId,
        after: { userId, adminUserId, expiresAt: expiresAt.toISOString(), reason },
      }),
    );
  }
}

function record(
  tx: PlatformTx,
  actor: PlatformActor,
  change: Omit<PlatformChange, "targetType" | "targetOrganizationId">,
): Promise<void> {
  return recordPlatformAudit(tx, actor, { ...change, targetType: "platform_staff" });
}
