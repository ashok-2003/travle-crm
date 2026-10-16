// The navigation follows the member's permissions (an Owner sees every destination, a salesperson Home, Today and
// Leads) and the organization's plan (an item of a module the plan lacks is hidden). Tests may read the domain's permission catalog
// (only src is kept to the api's types), and this needs no DOM.
// @vitest-environment node
import { planModules } from "@travel-crm/contracts/subscriptions";
import { isPermission } from "@travel-crm/domain/identity";
import { describe, expect, it } from "vitest";
import { holds } from "@/session/me-context";
import { isCurrent, isOnPlan, navigationItems, visibleNavigationItems } from "@/shell/navigation";
import { member } from "../support/members";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("visibleNavigationItems", () => {
  it("orders an Owner's items Home, Today, Leads, Staff, Roles, Settings, Audit log, and a salesperson's Home, Today, Leads", () => {
    expect(keys(visibleNavigationItems(member({ isOwner: true })))).toEqual([
      "home",
      "today",
      "leads",
      "staff",
      "roles",
      "settings",
      "audit",
    ]);
    const sales = member({ permissions: ["leads:view", "leads:create", "leads:edit"] });
    expect(keys(visibleNavigationItems(sales, ["crm"]))).toEqual(["home", "today", "leads"]);
  });

  it("shows each item only to roles holding its permission", () => {
    expect(keys(visibleNavigationItems(member({ permissions: ["leads:view"] })))).toEqual(["home", "today", "leads"]);
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
    // The Foundation's own screens belong to no module: every plan shows them. Today and Leads are crm's.
    expect(keys(visibleNavigationItems(member({ isOwner: true }), []))).toEqual([
      "home",
      "staff",
      "roles",
      "settings",
      "audit",
    ]);
  });

  it("names a plan module or none, and a permission the catalog knows, for each item", () => {
    for (const item of navigationItems) {
      expect([null, ...planModules]).toContain(item.module);
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
  const home = navigationItems.find((item) => item.key === "home");
  const staff = navigationItems.find((item) => item.key === "staff");

  it("marks Home only on the home page, and other items on their pages and below", () => {
    if (!home || !staff) throw new Error("navigation items missing");
    expect(isCurrent(home, "/")).toBe(true);
    expect(isCurrent(home, "/staff")).toBe(false);
    expect(isCurrent(staff, "/staff")).toBe(true);
    expect(isCurrent(staff, "/staff/new")).toBe(true);
    expect(isCurrent(staff, "/staffing")).toBe(false);
  });

  it("marks Leads on a lead's page and the new-lead form, and Today on its own", () => {
    const leads = navigationItems.find((item) => item.key === "leads");
    const today = navigationItems.find((item) => item.key === "today");
    if (!leads || !today) throw new Error("navigation items missing");
    expect(isCurrent(leads, "/leads/0199e7a0-0000-7000-8000-0000000000e1")).toBe(true);
    expect(isCurrent(leads, "/leads/new")).toBe(true);
    expect(isCurrent(today, "/today")).toBe(true);
    expect(isCurrent(today, "/leads")).toBe(false);
  });

  it("marks Settings on the setup checklist, which leads back to it", () => {
    const settings = navigationItems.find((item) => item.key === "settings");
    if (!settings || !home) throw new Error("navigation items missing");
    expect(isCurrent(settings, "/setup")).toBe(true);
    expect(isCurrent(home, "/setup")).toBe(false);
    expect(isCurrent(settings, "/setups")).toBe(false);
  });
});
