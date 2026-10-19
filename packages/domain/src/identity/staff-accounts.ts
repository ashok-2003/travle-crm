// Writes one staff member's sign-in records in one transaction, their own or the caller's: the user, a password account
// when they have a password, the membership, and the audit entry, after holding and checking their role in that same
// transaction. Better Auth hashes passwords, but its sign-up endpoint is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { recordAudit } from "../audit/index.js";
import { DomainError, systemActor, type Actor } from "../kernel/index.js";
import { findRoleToGive, type FoundRole } from "./role-lookup.js";
import { INTERNAL_USERNAME_PATTERN, internalUsername, placeholderEmail } from "./sign-in-names.js";

/** Hashes a password the way Better Auth checks it at sign-in. */
export type PasswordHasher = (password: string) => Promise<string>;

export interface NewStaffAccount {
  organizationId: string;
  name: string;
  /** Lowercase. Leave out for staff without email: they get a placeholder address. */
  email?: string | undefined;
  /** As typed, e.g. "Ravi". Needed for organization-code sign-in, and when there is no email. */
  username?: string | undefined;
  roleKey: string;
  password: string;
  /** True for a temporary password set by an admin. */
  mustChangePassword: boolean;
  /** Who is adding them, for the audit log. Left out, the system adds them: createOrganizationOwner, for tests. */
  actor?: Actor | undefined;
  /** The organization's seats (spec 7.2), or null or left out for no limit. */
  seatLimit?: number | null | undefined;
  /** In E.164 (B51). Kept on the membership, never in the audit log. */
  phone?: string | undefined;
  /** The import that added them (B47): the audit entry keeps its id, so the entry leads back to it. */
  importId?: string | undefined;
}

export interface CreatedStaff {
  userId: string;
  memberId: string;
}

/** An account's records as insertStaffAccount writes them: a password hash, or none until the person chooses one. */
export interface StaffAccountRecord extends Omit<NewStaffAccount, "password"> {
  /** Null for someone invited by email: they choose their password from the invite's link. */
  passwordHash: string | null;
}

/**
 * checkRole, when given, may refuse the role by throwing: it runs inside the transaction, on the role as it is once
 * held, so a simultaneous deleteRole or updateRole can't change it between the check and the write. Onboarding passes
 * none.
 */
export async function createStaffAccount(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  account: NewStaffAccount,
  checkRole?: (role: FoundRole) => void,
): Promise<CreatedStaff> {
  // Hashing is slow on purpose: refuse what can't be written before it, and hash before opening the transaction.
  assertHasSignInName(account);
  const { password, ...rest } = account;
  const record = { ...rest, passwordHash: await hashPassword(password) };
  return database.forOrg(account.organizationId, (tx) => insertStaffAccount(tx, record, checkRole));
}

/**
 * What an account's insert looks up about its organization and its role. A caller adding many accounts in one
 * transaction (an import) answers from what it already holds, instead of asking the database for each.
 */
export interface AccountLookups {
  organization(): Promise<{ code: string }>;
  role(key: string): Promise<FoundRole>;
}

/**
 * Writes the account in the caller's transaction, in the account's organization: the user, a password account when
 * there is a hash, the membership, and the audit entry. Onboarding calls it inside the platform's transaction, stepped
 * into the new organization.
 */
export async function insertStaffAccount(
  tx: IdentityTx,
  account: StaffAccountRecord,
  checkRole?: (role: FoundRole) => void,
  lookups?: AccountLookups,
): Promise<CreatedStaff> {
  assertHasSignInName(account);
  try {
    const organization = await (lookups
      ? lookups.organization()
      : tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } }));
    if (account.seatLimit !== undefined && account.seatLimit !== null) {
      await assertSeatsFree(tx, account.organizationId, account.seatLimit, 1);
    }
    const role = await (lookups ? lookups.role(account.roleKey) : findRoleToGive(tx, account.roleKey));
    checkRole?.(role);
    const username = account.username === undefined ? null : internalUsername(organization.code, account.username);
    if (username !== null && !INTERNAL_USERNAME_PATTERN.test(username)) {
      throw new DomainError(
        "VALIDATION",
        "INVALID_USERNAME",
        "Usernames use letters, digits, _ . - (2 to 32 characters)",
      );
    }
    const user = await tx.user.create({
      data: {
        name: account.name,
        // Better Auth lowercases the email at sign-in, and the unique index is case-sensitive.
        email: account.email?.toLowerCase() ?? placeholderEmail(organization.code, account.username ?? ""),
        username,
        displayUsername: account.username ?? null,
        mustChangePassword: account.mustChangePassword,
      },
    });
    // Better Auth's password sign-in reads the "credential" account whose accountId is the user id. Without a hash
    // there is none yet: Better Auth's password reset creates it when the invited person chooses their password.
    if (account.passwordHash !== null) {
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: account.passwordHash },
      });
    }
    const member = await tx.member.create({
      data: {
        userId: user.id,
        organizationId: account.organizationId,
        role: role.key,
        phoneE164: account.phone ?? null,
      },
    });
    // No name, username or address: the log outlives the account, and erasure clears those on the user row (ADR 0007).
    // The member id leads to the person.
    await recordAudit(tx, account.actor ?? systemActor(account.organizationId), {
      action: "staff.created",
      entityType: "member",
      entityId: member.id,
      after: {
        role: role.key,
        hasEmail: account.email !== undefined,
        ...(account.importId !== undefined && { importId: account.importId }),
      },
    });
    return { userId: user.id, memberId: member.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "EMAIL_OR_USERNAME_TAKEN", "That email or username is already in use");
    }
    throw error;
  }
}

/** Everyone signs in by an email, a username, or both. */
function assertHasSignInName(account: { email?: string | undefined; username?: string | undefined }): void {
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
}

/**
 * Refuses `adding` new members once the organization's active members fill its seats. The organization's row is held
 * until the transaction ends, so two people added at once, or an import and a person, can't both take the last seat:
 * NO KEY UPDATE conflicts with itself. Not FOR UPDATE, which also conflicts with the KEY SHARE that every insert of a
 * row keyed to the organization takes: an updateRole holding the role this addition then waits for, while inserting
 * permissions, would deadlock with it.
 */
export async function assertSeatsFree(
  tx: IdentityTx,
  organizationId: string,
  seatLimit: number,
  adding: number,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organization WHERE id = ${organizationId}::uuid FOR NO KEY UPDATE`;
  // Soft delete leaves removed members out: they free their seat.
  if ((await tx.member.count({ where: { organizationId } })) + adding > seatLimit) {
    throw new DomainError("LIMIT_REACHED", "SEAT_LIMIT_REACHED", "Every seat on this organization's plan is taken");
  }
}
