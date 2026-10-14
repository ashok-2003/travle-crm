// Creates one staff member's sign-in records in a single transaction: user, password account and membership.
// Better Auth hashes the password, but its sign-up endpoint is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { internalUsername, placeholderEmail } from "./sign-in-names.js";

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

export async function createStaffAccount(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  account: NewStaffAccount,
): Promise<CreatedStaff> {
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
  // Hashing is slow on purpose; do it before opening the transaction.
  const passwordHash = await hashPassword(account.password);
  try {
    return await database.forOrg(account.organizationId, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
      const role = await tx.role.findUnique({
        where: { organizationId_key: { organizationId: account.organizationId, key: account.roleKey } },
      });
      if (!role) throw new DomainError("NOT_FOUND", "ROLE_NOT_FOUND", `No role ${account.roleKey}`);
      const username = account.username === undefined ? null : internalUsername(organization.code, account.username);
      const user = await tx.user.create({
        data: {
          name: account.name,
          email: account.email ?? placeholderEmail(organization.code, account.username ?? ""),
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
