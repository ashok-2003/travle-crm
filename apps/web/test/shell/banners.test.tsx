// The banners above every screen: support impersonating the member always shows one (spec 6.1), and so does being
// offline (DESIGN.md), and neither shows otherwise.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { Banners } from "@/shell/banners";
import { member } from "../support/members";

const { banners } = messages.shell;

function renderBanners(me: SignedInMember) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MeProvider me={me}>
        <Banners />
      </MeProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Banners", () => {
  it("says so while support is signed in as the member", () => {
    renderBanners(member({ impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" }));
    expect(screen.getByText(banners.impersonated)).toBeVisible();
  });

  it("shows nothing for the member themselves, online", () => {
    const { container } = renderBanners(member());
    expect(container).toBeEmptyDOMElement();
  });

  it("says so while the device is offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBanners(member());
    expect(screen.getByRole("status")).toHaveTextContent(banners.offline);
  });
});
