// Nobody hands out more than they hold, changes their own access, or touches an Owner unless they are one.
import { describe, expect, it } from "vitest";
import {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "../../src/identity/access-rules.js";
import { pendingStep } from "../../src/identity/member-access.js";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { memberWithStarterRole, refusalOf } from "./rule-helpers.js";

const ownerRole = { isOwner: true, permissions: PermissionSet.everything() };
const salesRole = {
  isOwner: false,
  permissions: PermissionSet.of([
    { permission: "leads:view", scope: "own" },
    { permission: "leads:create", scope: null },
  ]),
};
const marginRole = {
  isOwner: false,
  permissions: PermissionSet.of([{ permission: "money:view_margin", scope: null }]),
};
const allLeadsRole = { isOwner: false, permissions: PermissionSet.of([{ permission: "leads:view", scope: "all" }]) };

describe("access rules", () => {
  const owner = memberWithStarterRole("org-owner");
  const admin = memberWithStarterRole("org-admin");
  const sales = memberWithStarterRole("sales");

  it("let only an Owner give or change the Owner role", () => {
    expect(refusalOf(assertMayHandleRole, owner, ownerRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, admin, ownerRole)).toBe("OWNER_ONLY");
  });

  it("let a member give a role only if they hold all it allows, at the same scope", () => {
    expect(refusalOf(assertMayHandleRole, admin, salesRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, sales, salesRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, sales, marginRole)).toBe("EXCEEDS_YOUR_PERMISSIONS");
    expect(refusalOf(assertMayHandleRole, sales, allLeadsRole)).toBe("EXCEEDS_YOUR_PERMISSIONS");
  });

  it("stop an Admin giving a role that allows changing roles, which Admin lacks", () => {
    const rolesRole = {
      isOwner: false,
      permissions: PermissionSet.of([{ permission: "roles:manage", scope: null }]),
    };
    expect(refusalOf(assertMayHandleRole, admin, rolesRole)).toBe("EXCEEDS_YOUR_PERMISSIONS");
  });

  it("stop a Sales member managing someone whose role allows margins", () => {
    const accounts = memberWithStarterRole("accounts");
    const target = { userId: "someone-else", role: { isOwner: false, permissions: accounts.permissions } };
    expect(refusalOf(assertMayManageMember, sales, target)).toBe("EXCEEDS_YOUR_PERMISSIONS");
  });

  it("stop members changing their own access, Owners included", () => {
    expect(refusalOf(assertMayManageMember, owner, { userId: owner.userId, role: ownerRole })).toBe(
      "CANNOT_CHANGE_YOURSELF",
    );
  });

  it("stop an Admin resetting, moving or removing an Owner", () => {
    expect(refusalOf(assertMayManageMember, admin, { userId: "someone-else", role: ownerRole })).toBe("OWNER_ONLY");
    expect(refusalOf(assertMayManageMember, admin, { userId: "someone-else", role: salesRole })).toBeNull();
  });

  it("keep the Owner role fixed", () => {
    expect(refusalOf(assertRoleIsEditable, { isOwner: true })).toBe("OWNER_ROLE_IS_FIXED");
    expect(refusalOf(assertRoleIsEditable, { isOwner: false })).toBeNull();
  });

  it("read requested grants, refusing unknown permissions and misplaced scopes", () => {
    expect(permissionSetFromInput([{ permission: "leads:view", scope: "all" }]).scopeOf("leads:view")).toBe("all");
    expect(refusalOf(permissionSetFromInput, [{ permission: "visas:apply" }])).toBe("UNKNOWN_PERMISSION");
    expect(refusalOf(permissionSetFromInput, [{ permission: "leads:view" }])).toBe("SCOPE_REQUIRED");
    expect(refusalOf(permissionSetFromInput, [{ permission: "leads:create", scope: "own" }])).toBe("SCOPE_NOT_ALLOWED");
  });

  it("ask for a password change before two-factor setup, and for neither when both are done", () => {
    const changeFirst = memberWithStarterRole("sales", {
      mustChangePassword: true,
      organizationRequiresTwoFactor: true,
    });
    expect(pendingStep(changeFirst)).toBe("CHANGE_PASSWORD");
    expect(pendingStep(memberWithStarterRole("sales", { organizationRequiresTwoFactor: true }))).toBe(
      "SET_UP_TWO_FACTOR",
    );
    const done = memberWithStarterRole("sales", { organizationRequiresTwoFactor: true, twoFactorEnabled: true });
    expect(pendingStep(done)).toBeNull();
  });
});
