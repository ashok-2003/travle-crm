// me.get answers for tests: an Owner, and a member of a role with the given permissions.
import type { SignedInMember } from "@/session/me-context";

export function member({
  isOwner = false,
  permissions = [],
}: { isOwner?: boolean; permissions?: string[] } = {}): SignedInMember {
  return {
    user: {
      id: "0199a000-0000-7000-8000-000000000001",
      name: "Asha",
      email: null,
      username: "asha",
      twoFactorEnabled: false,
    },
    impersonatedBy: null,
    isPlatformAdmin: false,
    organization: {
      id: "0199a000-0000-7000-8000-000000000002",
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
