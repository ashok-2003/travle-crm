// The navigation follows the member's permissions: an Owner sees every destination, a salesperson only Home.
import { describe, expect, it } from "vitest";
import { holds } from "@/session/me-context";
import { isCurrent, navigationItems, visibleNavigationItems } from "@/shell/navigation";
import { member } from "../support/members";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("visibleNavigationItems", () => {
  it("shows an Owner everything", () => {
    expect(keys(visibleNavigationItems(member({ isOwner: true })))).toEqual(["home", "staff", "roles", "settings"]);
  });

  it("shows each item only to roles holding its permission", () => {
    expect(keys(visibleNavigationItems(member({ permissions: ["leads:view"] })))).toEqual(["home"]);
    expect(keys(visibleNavigationItems(member({ permissions: ["staff:manage", "settings:manage"] })))).toEqual([
      "home",
      "staff",
      "settings",
    ]);
  });

  it("names a module (none yet) and a permission the catalog knows for each item", () => {
    for (const item of navigationItems) {
      expect(item.module).toBeNull();
      if (item.requires !== null) expect(item.requires).toMatch(/^[a-z_]+:[a-z_]+$/);
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
