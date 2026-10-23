// The data-deletion status page: public, it says the data is deleted for a code of the right shape and nothing for any other,
// names no organization, and is no page the worker keeps or the app's data layer wraps.
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import MetaDeletionPage from "@/app/meta/deletion/page";
import { locale, messages } from "@/i18n/messages";
import { metaDeletionCodeIsWellFormed } from "@/lib/meta-deletion";
import { isPublicFormPath, metaDeletionRoute } from "@/lib/routes";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "metaLeads.deletion") =>
    Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

const code = "Ab3_-Zq9Ab3_-Zq9Ab3_-Zq9Ab3_-Zq9";

describe("the data-deletion status page", () => {
  it("says the connection data is deleted for a well-formed code", async () => {
    render(await MetaDeletionPage({ searchParams: Promise.resolve({ code }) }));
    expect(screen.getByRole("heading", { name: "Your connection data has been deleted" })).toBeInTheDocument();
    expect(screen.getByText(/The leads that came in stay with the agency/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/dashboard");
  });

  it("says it cannot find the request for a missing, short, odd or repeated code", async () => {
    for (const bad of [undefined, "", "short", `${code}x`, `${code.slice(1)}!`, ["a", "b"]]) {
      const { unmount } = render(await MetaDeletionPage({ searchParams: Promise.resolve({ code: bad }) }));
      expect(screen.getByRole("heading", { name: "We can't find this request" }), String(bad)).toBeInTheDocument();
      unmount();
    }
  });

  it("checks the code's shape alone, and is a visitor's page that keeps nothing on the device", () => {
    expect(metaDeletionCodeIsWellFormed(code)).toBe(true);
    expect(metaDeletionCodeIsWellFormed("a".repeat(31))).toBe(false);
    expect(isPublicFormPath(metaDeletionRoute)).toBe(true);
  });
});
