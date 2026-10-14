// Creates one staff member's sign-in records in a single transaction: user, password account and membership, after
// holding and checking their role in that same transaction. Better Auth hashes the password, but its sign-up endpoint
// is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
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
}

export interface CreatedStaff {
  userId: string;
  memberId: string;
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
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
  // Hashing is slow on purpose; do it before opening the transaction.
  const passwordHash = await hashPassword(account.password);
  try {
    return await database.forOrg(account.organizationId, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
      const role = await findRoleToGive(tx, account.roleKey);
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
      // Better Auth's password sign-in reads the "credential" account whose accountId is the user id.
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });
      const member = await tx.member.create({
        data: { userId: user.id, organizationId: account.organizationId, role: role.key },
      });
      return { userId: user.id, memberId: member.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "EMAIL_OR_USERNAME_TAKEN", "That email or username is already in use");
    }
    throw error;
  }
}
