// The roles editor's grants: permissions grouped by module in the catalog's order, view permissions ticked with the
// narrowest scope first, and the api's input with a scope only where the permission takes one.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { byModule, setScope, toGrantInputs, toggle, type Grant } from "@/organization/roles/permission-grants";

const leadsView: PermissionCatalogEntry = { permission: "leads:view", module: "leads", scoped: true };
const leadsCreate: PermissionCatalogEntry = { permission: "leads:create", module: "leads", scoped: false };

const catalog: PermissionCatalogEntry[] = [
  { permission: "staff:manage", module: "staff", scoped: false },
  leadsView,
  leadsCreate,
  { permission: "roles:manage", module: "roles", scoped: false },
];

describe("byModule", () => {
  it("groups permissions by module, in the catalog's order", () => {
    expect(byModule(catalog).map(({ module, entries }) => [module, entries.map((entry) => entry.permission)])).toEqual([
      ["staff", ["staff:manage"]],
      ["leads", ["leads:view", "leads:create"]],
      ["roles", ["roles:manage"]],
    ]);
  });
});

describe("toggle", () => {
  it("grants a view permission for the member's own records first", () => {
    expect(toggle([], leadsView, true)).toEqual([{ permission: "leads:view", scope: "own" }]);
    expect(toggle([], leadsCreate, true)).toEqual([{ permission: "leads:create", scope: null }]);
  });

  it("takes a permission away, and never lists one twice", () => {
    const grants: Grant[] = [{ permission: "leads:view", scope: "all" }];
    expect(toggle(grants, leadsView, false)).toEqual([]);
    expect(toggle(grants, leadsView, true)).toEqual(grants);
  });
});

describe("setScope", () => {
  it("changes whose records a view permission covers", () => {
    expect(setScope([{ permission: "leads:view", scope: "own" }], "leads:view", "all")).toEqual([
      { permission: "leads:view", scope: "all" },
    ]);
  });
});

describe("toGrantInputs", () => {
  it("sends a scope only with the permissions that take one", () => {
    expect(
      toGrantInputs([
        { permission: "leads:view", scope: "all" },
        { permission: "leads:create", scope: null },
      ]),
    ).toEqual([{ permission: "leads:view", scope: "all" }, { permission: "leads:create" }]);
  });
});
