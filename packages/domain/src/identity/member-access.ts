// Who is acting in an organization: their membership, role and permissions, read from the database on every request.
import { features } from "@travel-crm/contracts/features";
import type { PendingStep } from "@travel-crm/contracts/identity";
import type { Actor } from "../kernel/index.js";
import type { PermissionSet } from "./permission-set.js";

/** A member acting in their organization. As an Actor it says where the request came from, for the audit log. */
export interface MemberAccess extends Actor {
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
 * need (Better Auth's /change-password and /two-factor/*, and me.get) stay open. With features.twoFactor off, never
 * two-factor, whatever the organization's stored requirement says.
 */
export function pendingStep(
  access: Pick<MemberAccess, "mustChangePassword" | "twoFactorEnabled" | "organizationRequiresTwoFactor">,
): PendingStep | null {
  if (access.mustChangePassword) return "CHANGE_PASSWORD";
  if (features.twoFactor && access.organizationRequiresTwoFactor && !access.twoFactorEnabled) {
    return "SET_UP_TWO_FACTOR";
  }
  return null;
}
