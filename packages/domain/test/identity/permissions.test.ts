// The permission catalog and permission sets: what a role can allow, and how scopes compare.
import { permissionKey } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { isPermission, moduleOf, permissionCatalog, permissions } from "../../src/identity/permissions.js";

describe("permission catalog", () => {
  it("covers the Foundation and every Phase 1 module", () => {
    for (const permission of [
      "staff:manage",
      "roles:manage",
      "settings:manage",
      "audit:view",
      "money:view_margin",
      "documents:view_sensitive",
    ]) {
      expect(isPermission(permission)).toBe(true);
    }
    expect(new Set(permissions.map(moduleOf))).toEqual(
      new Set([
        "staff",
        "roles",
        "settings",
        "audit",
        "money",
        "documents",
        "leads",
        "inbox",
        "quotes",
        "bookings",
        "departures",
        "suppliers",
        "accounts",
        "ai",
      ]),
    );
  });

  it("names every permission module:action, once", () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    for (const permission of permissions) expect(permission).toMatch(/^[a-z]+:[a-z_]+$/);
  });

  it("only holds keys the API contract accepts", () => {
    for (const permission of permissions) expect(permissionKey.safeParse(permission).success).toBe(true);
  });

  it("marks the views of assignable records as scoped", () => {
    const scoped = permissionCatalog.filter((entry) => entry.scoped).map((entry) => entry.permission);
    expect(scoped).toEqual(["leads:view", "quotes:view", "bookings:view", "inbox:view"]);
  });
});

describe("PermissionSet", () => {
  it("holds everything, over all records, for the Owner", () => {
    const owner = PermissionSet.everything();
    expect(owner.missing([...permissions])).toEqual([]);
    expect(owner.scopeOf("leads:view")).toBe("all");
  });

  it("treats a view permission without a scope as own records only", () => {
    expect(PermissionSet.of([{ permission: "leads:view", scope: null }]).scopeOf("leads:view")).toBe("own");
    expect(PermissionSet.of([{ permission: "leads:create", scope: "all" }]).toGrants()).toEqual([
      { permission: "leads:create", scope: null },
    ]);
  });

  it("covers another set only with every permission at the same or a wider scope", () => {
    const allLeads = PermissionSet.of([{ permission: "leads:view", scope: "all" }]);
    const ownLeads = PermissionSet.of([{ permission: "leads:view", scope: "own" }]);
    expect(allLeads.covers(ownLeads)).toBe(true);
    expect(ownLeads.covers(allLeads)).toBe(false);
    expect(ownLeads.covers(PermissionSet.of([{ permission: "leads:create", scope: null }]))).toBe(false);
  });

  it("ignores stored permissions that are no longer in the catalog", () => {
    const stored = PermissionSet.fromStored([
      { permission: "leads:create", scope: null },
      { permission: "visas:apply", scope: null },
    ]);
    expect(stored.toGrants()).toEqual([{ permission: "leads:create", scope: null }]);
  });
});
