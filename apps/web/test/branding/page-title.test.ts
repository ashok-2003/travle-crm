// The branding page's title is the message its heading shows, so the tab and the screen can't drift apart.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "documents.branding") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

describe("the branding page", () => {
  it("is titled with its heading's message", async () => {
    const { generateMetadata } = await import("@/app/(app)/settings/branding/page");
    expect(await generateMetadata()).toEqual({ title: messages.documents.branding.title });
  });
});
