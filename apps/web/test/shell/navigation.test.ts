// The navigation follows the member's permissions (an Owner sees every destination, a salesperson only Home) and the
// organization's plan (an item of a module the plan lacks is hidden). Tests may read the domain's permission catalog
// (only src is kept to the api's types), and this needs no DOM.
// @vitest-environment node
import { isPermission } from "@travel-crm/domain/identity";
import { describe, expect, it } from "vitest";
import { holds } from "@/session/me-context";
import { isCurrent, isOnPlan, navigationItems, visibleNavigationItems } from "@/shell/navigation";
import { member } from "../support/members";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("visibleNavigationItems", () => {
  it("shows an Owner everything", () => {
    expect(keys(visibleNavigationItems(member({ isOwner: true })))).toEqual([
      "home",
      "staff",
      "roles",
      "settings",
      "audit",
    ]);
  });

  it("shows each item only to roles holding its permission", () => {
    expect(keys(visibleNavigationItems(member({ permissions: ["leads:view"] })))).toEqual(["home"]);
    expect(keys(visibleNavigationItems(member({ permissions: ["staff:manage", "settings:manage"] })))).toEqual([
      "home",
      "staff",
      "settings",
    ]);
  });

  it("hides an item whose module isn't on the plan, and nothing while the plan is unknown", () => {
    expect(isOnPlan({ module: "crm" }, ["crm", "quotes"])).toBe(true);
    expect(isOnPlan({ module: "crm" }, ["quotes"])).toBe(false);
    expect(isOnPlan({ module: "crm" }, undefined)).toBe(true);
    expect(isOnPlan({ module: null }, [])).toBe(true);
    // The Foundation's own screens belong to no module: every plan shows them.
    expect(keys(visibleNavigationItems(member({ isOwner: true }), []))).toEqual([
      "home",
      "staff",
      "roles",
      "settings",
      "audit",
    ]);
  });

  it("names a module (none yet) and a permission the catalog knows for each item", () => {
    for (const item of navigationItems) {
      expect(item.module).toBeNull();
      // A typo such as "staff:manger" would hide the item from everyone but Owners.
      if (item.requires !== null) expect(isPermission(item.requires), item.requires).toBe(true);
    }
  });
});

describe("holds", () => {
  it("is true for an Owner whatever the list says", () => {
    expect(holds(member({ isOwner: true }), "roles:manage")).toBe(true);
    expect(holds(member({ permissions: ["staff:manage"] }), "roles:manage")).toBe(false);
  });
});

describe("isCurrent", () => {
  const [home, staff] = navigationItems;

  it("marks Home only on the home page, and other items on their pages and below", () => {
    if (!home || !staff) throw new Error("navigation items missing");
    expect(isCurrent(home, "/")).toBe(true);
    expect(isCurrent(home, "/staff")).toBe(false);
    expect(isCurrent(staff, "/staff")).toBe(true);
    expect(isCurrent(staff, "/staff/new")).toBe(true);
    expect(isCurrent(staff, "/staffing")).toBe(false);
  });
});
