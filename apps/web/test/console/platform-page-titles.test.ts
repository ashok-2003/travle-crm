// The console's platform pages (plans, jobs, log, staff, data protection) are each titled as their heading: their
// screen's message, inside the console's "<screen> · Console · <product>" pattern.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "consolePlatform.plans") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

type Screen = "plans" | "jobs" | "log" | "staff" | "dataProtection";

const pages: [Screen, () => Promise<{ generateMetadata: () => Promise<unknown> }>][] = [
  ["plans", () => import("@/app/console/plans/page")],
  ["jobs", () => import("@/app/console/jobs/page")],
  ["log", () => import("@/app/console/log/page")],
  ["staff", () => import("@/app/console/staff/page")],
  ["dataProtection", () => import("@/app/console/organizations/[organizationId]/data-protection/page")],
];

describe("the platform pages", () => {
  // The first import of each transforms the screen's whole module graph, which takes a while on a busy machine.
  it.each(pages)("title %s as its heading", { timeout: 20_000 }, async (screen, load) => {
    const { generateMetadata } = await load();
    expect(await generateMetadata()).toEqual({ title: messages.consolePlatform[screen].title });
  });
});
