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
import { insertStaffAccount, type CreatedStaff } from "./staff-accounts.js";
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
