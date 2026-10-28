// The identity side of onboarding (spec 7.1): the organization's own row, and its first Owner, invited by email. Both
// run in the caller's transaction, so the platform console onboards an organization in one transaction: it creates
// the row as the platform role, then steps into the new organization (asOrganization) for the roles and the Owner.
import { staffInvitedEvent } from "@travel-crm/contracts/identity";
import { isUniqueViolation, type IdentityTx } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { hasChosenPassword } from "./password-emails.js";
import { isPlaceholderEmail } from "./sign-in-names.js";
import { insertStaffAccount, TEMPORARY_PASSWORD_STAMP, type CreatedStaff } from "./staff-accounts.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface NewOrganization {
  name: string;
  /** The sign-in code, e.g. SHARMA: 3-12 capital letters or digits. It never changes once there are staff. */
  code: string;
  /** An IANA zone, e.g. Asia/Kolkata. */
  timeZone: string;
  /** Where replies to the organization's email go (spec 9.4). */
  contactEmail: string | null;
}

/** The organization's row. Only the platform role may insert one: the api never creates organizations. */
export async function createOrganizationRecord(
  tx: IdentityTx,
  organization: NewOrganization,
): Promise<{ id: string; code: string }> {
  try {
    return await tx.organization.create({ data: organization, select: { id: true, code: true } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "ORGANIZATION_CODE_TAKEN", "Another organization has that code");
    }
    throw error;
  }
}

/**
 * The organization's first Owner, in the transaction's organization, with no password yet: the invite email lets
 * them choose one. Recorded as "staff.created" and "staff.invited" by `actor` (the platform admin at onboarding).
 */
export async function inviteOwner(
  tx: IdentityTx,
  actor: Actor,
  owner: { name: string; email: string },
): Promise<CreatedStaff> {
  const created = await insertStaffAccount(tx, {
    organizationId: actor.organizationId,
    name: owner.name,
    email: owner.email,
    roleKey: OWNER_ROLE_KEY,
    passwordHash: null,
    mustChangePassword: false,
    actor,
  });
  await requestInvite(tx, actor, created.memberId);
  return created;
}

/**
 * A member who signs in with the organization's code, a username and a password already chosen, in the transaction's
 * organization: the shared demo's staff (no email, no invite). Recorded as "staff.created" by `actor`.
 */
export async function addStaffWithPassword(
  tx: IdentityTx,
  actor: Actor,
  staff: { name: string; username: string; roleKey: string; passwordHash: string },
): Promise<CreatedStaff> {
  return insertStaffAccount(tx, {
    organizationId: actor.organizationId,
    name: staff.name,
    username: staff.username,
    roleKey: staff.roleKey,
    passwordHash: staff.passwordHash,
    mustChangePassword: false,
    actor,
  });
}

/**
 * Asks for an invite email to an active member who has a real address and no password yet (the Owner from
 * onboarding, until they choose one): publishes "staff.invited", which the worker's identity.send-invite listener
 * turns into an email with a link to choose a password. Asking again sends a new link; the earlier ones keep working
 * until they lapse. Someone with a password resets it instead, within the reset's hour. Recorded as "staff.invited".
 */
export async function requestInvite(tx: IdentityTx, actor: Actor, memberId: string): Promise<void> {
  // The member table has no row-level security, so the organization is filtered here.
  const member = await tx.member.findFirst({
    where: { id: memberId, organizationId: actor.organizationId },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  if (isPlaceholderEmail(member.user.email)) {
    throw new DomainError("VALIDATION", "NO_EMAIL", "This person has no email address to send an invite to");
  }
  if (await hasChosenPassword(tx, member.userId)) {
    throw new DomainError(
      "CONFLICT",
      "PASSWORD_ALREADY_SET",
      "This person has a password already: they can reset it from the sign-in page",
    );
  }
  await publishEvent(tx, {
    type: "staff.invited",
    payload: staffInvitedEvent.parse({ memberId: member.id, userId: member.userId }),
  });
  await recordAudit(tx, actor, { action: "staff.invited", entityType: "member", entityId: member.id });
}

/** The invite program's Owner signs in with the organization's code and this username. */
export const INVITED_OWNER_USERNAME = "owner";

/**
 * The invite program's first Owner (the owner, 2026-10-28), in the transaction's organization: signs in with the code
 * and "owner" and a password the platform made, which their invite link signs them in with, so they type nothing. The
 * account carries the temporary stamp until they choose their own. Their email, when given and free, is theirs to sign
 * in with too; else they get a placeholder. Recorded as "staff.created" by `actor`.
 */
export async function addInvitedOwner(
  tx: IdentityTx,
  actor: Actor,
  owner: { name: string; email: string | null; phone: string | null; passwordHash: string },
): Promise<CreatedStaff> {
  const email = owner.email?.toLowerCase() ?? null;
  const free =
    email !== null && (await tx.user.findFirst({ where: { email }, select: { id: true } })) === null ? email : null;
  const created = await insertStaffAccount(tx, {
    organizationId: actor.organizationId,
    name: owner.name,
    ...(free === null ? {} : { email: free }),
    username: INVITED_OWNER_USERNAME,
    roleKey: OWNER_ROLE_KEY,
    passwordHash: owner.passwordHash,
    mustChangePassword: false,
    ...(owner.phone === null ? {} : { phone: owner.phone }),
    actor,
  });
  await tx.account.updateMany({
    where: { userId: created.userId, providerId: "credential" },
    data: { updatedAt: TEMPORARY_PASSWORD_STAMP },
  });
  return created;
}

/**
 * A new one-time password for an invited Owner who hasn't chosen their own yet, so their link signs them in again;
 * false once they have (their own password is never touched).
 */
export async function renewInvitedOwnerPassword(
  tx: IdentityTx,
  organizationId: string,
  userId: string,
  passwordHash: string,
): Promise<boolean> {
  // The member table has no row-level security, so the organization is filtered here.
  const member = await tx.member.findFirst({ where: { userId, organizationId }, select: { id: true } });
  if (member === null) return false;
  const renewed = await tx.account.updateMany({
    where: { userId, providerId: "credential", updatedAt: TEMPORARY_PASSWORD_STAMP },
    data: { password: passwordHash, updatedAt: TEMPORARY_PASSWORD_STAMP },
  });
  return renewed.count === 1;
}
