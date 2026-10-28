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

  it("gives the Owner and the Admin starter role leads:assign, and Sales none", () => {
    expect(PermissionSet.everything().has("leads:assign")).toBe(true);
    expect(roleNamed("Admin").has("leads:assign")).toBe(true);
    for (const name of ["Sales", "Operations", "Accounts"])
      expect(roleNamed(name).has("leads:assign"), name).toBe(false);
  });

  it("keep Sales to their own records and away from margins, staff and settings", () => {
    const sales = roleNamed("Sales");
    expect(sales.scopeOf("leads:view")).toBe("own");
    expect(sales.scopeOf("bookings:view")).toBe("own");
    expect(sales.missing(["money:view_margin", "staff:manage", "settings:manage"])).toHaveLength(3);
  });

  it("show travellers' ID documents to Operations, but not to Sales or Accounts", () => {
    expect(roleNamed("Operations").has("documents:view_sensitive")).toBe(true);
    expect(roleNamed("Admin").has("documents:view_sensitive")).toBe(true);
    expect(roleNamed("Sales").has("documents:view_sensitive")).toBe(false);
    expect(roleNamed("Accounts").has("documents:view_sensitive")).toBe(false);
  });

  it("lets Sales ask the AI for a suggested reply, and only the Owner and Admin switch it on", () => {
    expect(roleNamed("Sales").has("ai:suggest")).toBe(true);
    expect(PermissionSet.everything().has("ai:manage")).toBe(true);
    expect(roleNamed("Admin").has("ai:manage")).toBe(true);
    for (const name of ["Sales", "Operations", "Accounts"]) expect(roleNamed(name).has("ai:manage"), name).toBe(false);
    for (const name of ["Operations", "Accounts"]) expect(roleNamed(name).has("ai:suggest"), name).toBe(false);
  });

  it("show the sales and collections reports to Accounts, and payments to be recorded, but not to Sales", () => {
    expect(roleNamed("Accounts").has("money:view_reports")).toBe(true);
    expect(roleNamed("Accounts").has("quotes:record_payments")).toBe(true);
    expect(roleNamed("Admin").has("money:view_reports")).toBe(true);
    for (const name of ["Sales", "Operations"]) {
      expect(roleNamed(name).has("money:view_reports"), name).toBe(false);
      expect(roleNamed(name).has("quotes:record_payments"), name).toBe(false);
    }
  });

  it("show margins to Accounts, but not to Operations", () => {
    expect(roleNamed("Accounts").has("money:view_margin")).toBe(true);
    expect(roleNamed("Operations").has("money:view_margin")).toBe(false);
  });
});
