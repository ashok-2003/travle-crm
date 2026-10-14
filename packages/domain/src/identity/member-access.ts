// Who is acting in an organization: their membership, role and permissions, read from the database on every request.
import type { PendingStep } from "@travel-crm/contracts/identity";
import type { PermissionSet } from "./permission-set.js";

export interface MemberAccess {
  readonly userId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly role: { readonly key: string; readonly name: string; readonly isOwner: boolean };
  readonly permissions: PermissionSet;
  /** Set until the member replaces a temporary password an admin gave them. */
  readonly mustChangePassword: boolean;
  readonly twoFactorEnabled: boolean;
  /** The organization requires every member to sign in with two-factor (organization.require_two_factor). */
  readonly organizationRequiresTwoFactor: boolean;
}

/**
 * What the member must do before the organization app lets them in, or null when nothing. The setup endpoints they
 * need (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 */
export function pendingStep(access: MemberAccess): PendingStep | null {
  if (access.mustChangePassword) return "CHANGE_PASSWORD";
  if (access.organizationRequiresTwoFactor && !access.twoFactorEnabled) return "SET_UP_TWO_FACTOR";
  return null;
}
