// The console's pages are titled "<screen> · Console · <product>": the console's layout sets the pattern, each page
// gives its screen's message, the one its heading shows.
import { brand } from "@travel-crm/brand";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "console") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

describe("console page titles", () => {
  it("follow the console's pattern", async () => {
    const { generateMetadata } = await import("@/app/console/layout");
    expect(await generateMetadata()).toEqual({
      title: {
        default: `${messages.console.title} · ${brand.productName}`,
        template: `%s · ${messages.console.title} · ${brand.productName}`,
      },
    });
  });

  it("name the dashboard as its heading does", async () => {
    const { generateMetadata } = await import("@/app/console/(dashboard)/page");
    expect(await generateMetadata()).toEqual({ title: messages.console.dashboard.title });
  });
});
