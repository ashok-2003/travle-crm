// /account/notifications is titled with the message its heading shows, so the tab and the screen can't drift apart.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "notifications") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

describe("the notification choices' page", () => {
  it("is titled as its heading", async () => {
    const { generateMetadata } = await import("@/app/(app)/account/notifications/page");
    expect(await generateMetadata()).toEqual({ title: messages.notifications.preferences.title });
  });
});
