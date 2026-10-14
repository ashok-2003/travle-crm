// The five starter roles (spec 6.5) and the defaults recorded in ADR 0005.
import { describe, expect, it } from "vitest";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { isPermission } from "../../src/identity/permissions.js";
import { OWNER_ROLE_KEY, starterRoles } from "../../src/identity/starter-roles.js";

const roleNamed = (name: string) => {
  const role = starterRoles.find((starter) => starter.name === name);
  if (!role) throw new Error(`No starter role named ${name}`);
  return PermissionSet.of(role.grants);
};

describe("starter roles", () => {
  it("are Owner, Admin, Sales, Operations and Accounts, and only Owner is the Owner role", () => {
    expect(starterRoles.map((role) => role.name)).toEqual(["Owner", "Admin", "Sales", "Operations", "Accounts"]);
    expect(starterRoles.filter((role) => role.isOwner).map((role) => role.key)).toEqual([OWNER_ROLE_KEY]);
  });

  it("never use Better Auth's built-in role names as keys", () => {
    for (const role of starterRoles) expect(["owner", "admin", "member"]).not.toContain(role.key);
  });

  it("grant only catalog permissions", () => {
    for (const role of starterRoles) {
      for (const grant of role.grants) expect(isPermission(grant.permission)).toBe(true);
    }
  });

  it("let Admin do everything except change roles", () => {
    const admin = roleNamed("Admin");
    expect(admin.has("roles:manage")).toBe(false);
    expect(admin.has("staff:manage")).toBe(true);
    expect(PermissionSet.everything().covers(admin)).toBe(true);
  });

  it("keep Sales to their own records and away from margins, staff and settings", () => {
    const sales = roleNamed("Sales");
    expect(sales.scopeOf("leads:view")).toBe("own");
    expect(sales.scopeOf("bookings:view")).toBe("own");
    expect(sales.missing(["money:view_margin", "staff:manage", "settings:manage"])).toHaveLength(3);
  });

  it("show margins to Accounts, but not to Operations", () => {
    expect(roleNamed("Accounts").has("money:view_margin")).toBe(true);
    expect(roleNamed("Operations").has("money:view_margin")).toBe(false);
  });
});
