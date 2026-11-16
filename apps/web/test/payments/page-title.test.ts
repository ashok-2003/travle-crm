// The Payments to check page is titled with the message its heading shows, so the tab and the screen can't drift apart.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "payments") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));
vi.mock("@/payments/payments-screen", () => ({ PaymentsScreen: () => null }));

describe("the Payments to check page", () => {
  it("is titled with its heading's message", async () => {
    const { generateMetadata } = await import("@/app/(app)/payments/page");
    expect(await generateMetadata()).toEqual({ title: messages.payments.title });
  });
});
