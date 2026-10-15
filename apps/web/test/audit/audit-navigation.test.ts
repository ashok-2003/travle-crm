// @vitest-environment node
// The audit log has a navigation item of its own, for every role that may read it (audit:view): the settings screen
// that also leads there needs settings:manage. Under /settings, it is the current item on its own page, not Settings.
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { isCurrent, navigationItems, visibleNavigationItems } from "@/shell/navigation";
import { member } from "../support/members";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

function item(key: string) {
  const found = navigationItems.find((entry) => entry.key === key);
  if (!found) throw new Error(`no navigation item ${key}`);
  return found;
}

describe("the audit log's navigation item", () => {
  it("leads to the audit log, named as its screen is", () => {
    expect(item("audit")).toMatchObject({ href: routes.audit, requires: "audit:view", module: null });
    expect(messages.shell.navigation.audit).toBe(messages.audit.title);
  });

  it("shows to every role that may read the audit log, after the other destinations", () => {
    expect(keys(visibleNavigationItems(member({ permissions: ["audit:view"] })))).toEqual(["home", "audit"]);
    expect(keys(visibleNavigationItems(member({ isOwner: true }))).at(-1)).toBe("audit");
    expect(keys(visibleNavigationItems(member({ permissions: ["settings:manage"] })))).toEqual(["home", "settings"]);
  });

  it("is the current item on its page, and Settings stays current on the other settings pages", () => {
    expect(isCurrent(item("audit"), "/settings/audit")).toBe(true);
    expect(isCurrent(item("settings"), "/settings/audit")).toBe(false);
    expect(isCurrent(item("settings"), "/settings")).toBe(true);
    expect(isCurrent(item("settings"), "/settings/profile")).toBe(true);
    expect(isCurrent(item("audit"), "/settings")).toBe(false);
  });
});
