// Each account page's title is the message its heading shows, so the tab and the screen can't drift apart (ADR 0018:
// every word on screen is a next-intl message).
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "account") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const { account } = messages;

const pages: [string, () => Promise<{ generateMetadata: () => Promise<unknown> }>, string][] = [
  ["/sign-in", () => import("@/app/(account)/sign-in/page"), account.signIn.title],
  ["/sign-in/two-factor", () => import("@/app/(account)/sign-in/two-factor/page"), account.twoFactor.title],
  ["/forgot-password", () => import("@/app/(account)/forgot-password/page"), account.forgotPassword.title],
  ["/reset-password", () => import("@/app/(account)/reset-password/page"), account.resetPassword.title],
  ["/change-password", () => import("@/app/(account)/change-password/page"), account.changePassword.title],
  ["/two-factor-setup", () => import("@/app/(account)/two-factor-setup/page"), account.twoFactorSetup.title],
  ["/account", () => import("@/app/(app)/account/page"), account.account.title],
];

describe("account page titles", () => {
  it.each(pages)("%s is titled with its heading's message", async (_, page, title) => {
    const { generateMetadata } = await page();
    expect(await generateMetadata()).toEqual({ title });
  });
});
