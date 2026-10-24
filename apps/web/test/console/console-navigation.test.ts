// The console's navigation: a super admin sees every destination, support all but Staff (platform staff are managed
// by super admins alone, spec 5). Hiding is a convenience; the console's api refuses support's calls there anyway.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { consoleRoutes } from "@/console/routes";
import { consoleNavigationItems, isCurrentConsoleItem, visibleConsoleItems } from "@/console/shell/console-navigation";
import { isSuperAdmin } from "@/console/session/staff-context";
import { platformStaff } from "../support/platform-staff";

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("visibleConsoleItems", () => {
  it("shows a super admin every destination", () => {
    expect(keys(visibleConsoleItems(platformStaff("super-admin")))).toEqual([
      "home",
      "onboard",
      "plans",
      "whatsapp",
      "jobs",
      "log",
      "staff",
    ]);
  });

  it("shows support everything but Staff", () => {
    expect(keys(visibleConsoleItems(platformStaff("support")))).toEqual([
      "home",
      "onboard",
      "plans",
      "whatsapp",
      "jobs",
      "log",
    ]);
  });

  it("leads each item to its console route", () => {
    expect(Object.fromEntries(consoleNavigationItems.map((item) => [item.key, item.href]))).toEqual({
      home: consoleRoutes.home,
      onboard: consoleRoutes.onboard,
      plans: consoleRoutes.plans,
      whatsapp: consoleRoutes.whatsapp,
      jobs: consoleRoutes.jobs,
      log: consoleRoutes.log,
      staff: consoleRoutes.staff,
    });
  });
});

describe("isSuperAdmin", () => {
  it("is true for a super admin only", () => {
    expect(isSuperAdmin(platformStaff("super-admin"))).toBe(true);
    expect(isSuperAdmin(platformStaff("support"))).toBe(false);
  });
});

describe("isCurrentConsoleItem", () => {
  const item = (key: string) => {
    const found = consoleNavigationItems.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`no ${key} item`);
    return found;
  };

  it("marks the dashboard on its page and an organization's, and other items on their pages and below", () => {
    expect(isCurrentConsoleItem(item("home"), "/console")).toBe(true);
    expect(isCurrentConsoleItem(item("home"), "/console/plans")).toBe(false);
    expect(isCurrentConsoleItem(item("home"), "/console/organizations/0199a000-0000-7000-8000-000000000002")).toBe(
      true,
    );
    expect(
      isCurrentConsoleItem(item("home"), "/console/organizations/0199a000-0000-7000-8000-000000000002/data-protection"),
    ).toBe(true);
    // Onboarding a new organization is Onboard's page, not the dashboard's.
    expect(isCurrentConsoleItem(item("home"), "/console/organizations/new")).toBe(false);
    expect(isCurrentConsoleItem(item("onboard"), "/console/organizations/new")).toBe(true);
    expect(isCurrentConsoleItem(item("plans"), "/console/plans")).toBe(true);
    expect(isCurrentConsoleItem(item("plans"), "/console/plans/growth")).toBe(true);
    expect(isCurrentConsoleItem(item("log"), "/console/logbook")).toBe(false);
  });
});

describe("consoleRoutes", () => {
  it("puts an organization's pages under its id", () => {
    const id = "0199a000-0000-7000-8000-000000000002";
    expect(consoleRoutes.organization(id)).toBe(`/console/organizations/${id}`);
    expect(consoleRoutes.dataProtection(id)).toBe(`/console/organizations/${id}/data-protection`);
  });
});
