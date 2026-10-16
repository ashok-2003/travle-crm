// Platform staff as platformStaff.list gives them, for the staff screen's tests: the super admin looking, support with
// a temporary password still to replace and no two-factor yet, and someone removed.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { platformStaff } from "../../support/platform-staff";

export const viewer = platformStaff("super-admin");

export function person(overrides: Partial<PlatformStaffEntry> = {}): PlatformStaffEntry {
  return {
    userId: "0199a000-0000-7000-8000-0000000000ae",
    name: "Arjun Nair",
    email: "arjun@platform.test",
    level: "support",
    mustChangePassword: true,
    twoFactorEnabled: false,
    createdAt: "2026-10-01T06:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
}

export const kavita = person({
  userId: viewer.userId,
  name: viewer.name,
  email: "kavita@platform.test",
  level: "super-admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
});

export const arjun = person();

export const meena = person({
  userId: "0199a000-0000-7000-8000-0000000000af",
  name: "Meena Pillai",
  email: "meena@platform.test",
  level: null,
  mustChangePassword: false,
  twoFactorEnabled: true,
  removedAt: "2026-10-10T06:00:00.000Z",
});
