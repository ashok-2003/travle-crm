// The console's pages are titled "<screen> · Console · <product>": the console's layout sets the pattern, each page
// gives its screen's message, the one its heading shows: the dashboard's, the organizations' (an organization's page
// also takes its organization and whether it was just onboarded from the address) and the platform's.
import { brand } from "@travel-crm/brand";
import { createTranslator } from "next-intl";
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "console") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

type Titled = () => Promise<{ generateMetadata: () => Promise<unknown> }>;
const organizationId = "0199a000-0000-7000-8000-000000000002";

// The first import of each page loads its whole screen, the calendar's date library included: seconds on a busy machine.
describe("console page titles", { timeout: 20_000 }, () => {
  it("follow the console's pattern", async () => {
    const { generateMetadata } = await import("@/app/console/layout");
    expect(await generateMetadata()).toEqual({
      title: {
        default: `${messages.console.title} · ${brand.productName}`,
        template: `%s · ${messages.console.title} · ${brand.productName}`,
      },
    });
  });

  const pages: [string, Titled, string][] = [
    ["the dashboard", () => import("@/app/console/(dashboard)/page"), messages.console.dashboard.title],
    ["onboarding", () => import("@/app/console/organizations/new/page"), messages.consoleOrganizations.onboard.title],
    [
      "an organization",
      () => import("@/app/console/organizations/[organizationId]/page"),
      messages.consoleOrganizations.organization.title,
    ],
    ["plans", () => import("@/app/console/plans/page"), messages.consolePlatform.plans.title],
    ["jobs", () => import("@/app/console/jobs/page"), messages.consolePlatform.jobs.title],
    ["the log", () => import("@/app/console/log/page"), messages.consolePlatform.log.title],
    ["staff", () => import("@/app/console/staff/page"), messages.consolePlatform.staff.title],
    [
      "data protection",
      () => import("@/app/console/organizations/[organizationId]/data-protection/page"),
      messages.consolePlatform.dataProtection.title,
    ],
  ];
  it.each(pages)("name %s as its heading does", async (_name, load, title) => {
    const { generateMetadata } = await load();
    expect(await generateMetadata()).toEqual({ title });
  });

  it("hand an organization's page the organization and the onboarded flag", async () => {
    const page = await import("@/app/console/organizations/[organizationId]/page");
    const element = await page.default({
      params: Promise.resolve({ organizationId }),
      searchParams: Promise.resolve({ onboarded: "1" }),
    });
    expect(isValidElement(element) && element.props).toEqual({ organizationId, onboarded: true });
    const plain = await page.default({
      params: Promise.resolve({ organizationId }),
      searchParams: Promise.resolve({}),
    });
    expect(isValidElement(plain) && plain.props).toMatchObject({ onboarded: false });
  });
});
