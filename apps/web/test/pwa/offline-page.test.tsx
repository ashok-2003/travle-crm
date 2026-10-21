// The offline page, shown in place of an address with no saved shell: "Try again" loads that same address again,
// query included (a GET form would drop it), and both ways out are full-size, 44px targets (DESIGN.md section 4).
import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import OfflinePage from "@/app/offline/page";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "pwa.offline") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));

/** Testing Library gives an empty href no link role; browsers and axe do (the journey finds it by role). */
function tryAgain(): HTMLAnchorElement {
  const link = screen.getByText("Try again").closest("a");
  if (!link) throw new Error("Try again isn't a link");
  return link;
}

describe("the offline page", () => {
  it("tries the same address again, query included, without needing scripts", async () => {
    window.history.replaceState(null, "", "/sign-in?next=%2Fstaff");
    render(await OfflinePage());
    // An empty href is the page's own address.
    expect(tryAgain()).toHaveAttribute("href", "");
    expect(tryAgain().href).toBe(window.location.href);
  });

  it("draws both ways out as full-size buttons", async () => {
    render(await OfflinePage());
    const home = screen.getByRole("link", { name: "Go to the home screen" });
    for (const link of [tryAgain(), home]) expect(link).toHaveAttribute("data-size", "default");
    expect(home).toHaveAttribute("href", "/dashboard");
  });
});
