// me.get answers for tests: an Owner, and a member of a role with the given permissions, optionally another person,
// in another organization, or with support impersonating them.
import type { SignedInMember } from "@/session/me-context";

export function member({
  isOwner = false,
  permissions = [],
  name = "Asha",
  userId = "0199a000-0000-7000-8000-000000000001",
  organizationId = "0199a000-0000-7000-8000-000000000002",
  impersonatedBy = null,
}: {
  isOwner?: boolean;
  permissions?: string[];
  name?: string;
  userId?: string;
  organizationId?: string;
  /** The platform admin's user id while support is signed in as this member. */
  impersonatedBy?: string | null;
} = {}): SignedInMember {
  return {
    user: {
      id: userId,
      name,
      email: null,
      username: name.toLowerCase(),
      twoFactorEnabled: false,
    },
    impersonatedBy,
    isPlatformAdmin: false,
    organization: {
      id: organizationId,
      name: "Sharma Travels",
      code: "SHARMA",
      requireTwoFactor: false,
      timeZone: "Asia/Kolkata",
    },
    member: {
      memberId: "0199a000-0000-7000-8000-000000000003",
      role: isOwner
        ? { key: "org-owner", name: "Owner", isOwner: true }
        : { key: "sales", name: "Sales", isOwner: false },
      permissions: permissions.map((permission) => ({ permission, scope: null })),
    },
    pendingStep: null,
  };
}
