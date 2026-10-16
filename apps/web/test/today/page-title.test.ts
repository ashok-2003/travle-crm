// Today's page is titled with the message its heading shows, so the tab and the screen can't drift apart.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "today") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));
// The title alone: loading the whole screen (its dialogs, pickers and icons) only slows the import past the timeout.
vi.mock("@/today/today-screen", () => ({ TodayScreen: () => null }));

describe("the Today page", () => {
  it("is titled with its heading's message", async () => {
    const { generateMetadata } = await import("@/app/(app)/today/page");
    expect(await generateMetadata()).toEqual({ title: messages.today.title });
  });
});
