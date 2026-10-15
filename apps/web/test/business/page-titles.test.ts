// Each business page's title is the message its heading shows, so the tab and the screen can't drift apart (ADR 0018:
// every word on screen is a next-intl message).
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "business") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const { business } = messages;

const pages: [string, () => Promise<{ generateMetadata: () => Promise<unknown> }>, string][] = [
  ["/settings/profile", () => import("@/app/(app)/settings/profile/page"), business.profile.title],
  ["/setup", () => import("@/app/(app)/setup/page"), business.setup.title],
];

describe("business page titles", () => {
  it.each(pages)("%s is titled with its heading's message", async (_, page, title) => {
    const { generateMetadata } = await page();
    expect(await generateMetadata()).toEqual({ title });
  });
});
