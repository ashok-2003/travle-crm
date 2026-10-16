// The organizations' console pages are titled by their screen, under the console's pattern ("<screen> · Console ·
// <product>"), and an organization's page takes its organization and whether it was just onboarded from the address.
import { createTranslator } from "next-intl";
import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "consoleOrganizations") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const { consoleOrganizations } = messages;

// The first import of a page loads its whole screen, the calendar's date library included: seconds on a busy machine.
describe("the organizations' console pages", { timeout: 20_000 }, () => {
  it("title onboarding as its heading does", async () => {
    const { generateMetadata } = await import("@/app/console/organizations/new/page");
    expect(await generateMetadata()).toEqual({ title: consoleOrganizations.onboard.title });
  });

  it("title an organization's page, and hand it the organization and the onboarded flag", async () => {
    const page = await import("@/app/console/organizations/[organizationId]/page");
    expect(await page.generateMetadata()).toEqual({ title: consoleOrganizations.organization.title });
    const element = await page.default({
      params: Promise.resolve({ organizationId: "0199a000-0000-7000-8000-000000000002" }),
      searchParams: Promise.resolve({ onboarded: "1" }),
    });
    expect(isValidElement(element) && element.props).toEqual({
      organizationId: "0199a000-0000-7000-8000-000000000002",
      onboarded: true,
    });
    const plain = await page.default({
      params: Promise.resolve({ organizationId: "0199a000-0000-7000-8000-000000000002" }),
      searchParams: Promise.resolve({}),
    });
    expect(isValidElement(plain) && plain.props).toMatchObject({ onboarded: false });
  });
});
