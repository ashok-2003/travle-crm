// /console/jobs is titled as its heading: "Jobs", inside the console's "<screen> · Console · <product>" pattern.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "consolePlatform.jobs") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

describe("the jobs page", () => {
  // The first import transforms the screen's whole module graph, which takes a while on a busy machine.
  it("is titled as its heading", { timeout: 15_000 }, async () => {
    const { generateMetadata } = await import("@/app/console/jobs/page");
    expect(await generateMetadata()).toEqual({ title: messages.consolePlatform.jobs.title });
  });
});
