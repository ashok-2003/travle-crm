// The phone's bottom bar shows where the person is even on a page that lives in More (DESIGN.md: the current page in
// blue): the More trigger is then current, and in its sheet the page's own item.
import { render, screen } from "@testing-library/react";
import { HouseIcon, UserIcon } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { locale, messages } from "@/i18n/messages";
import { PhoneNavigation, type PhoneDestination } from "@/shell/phone-navigation";
import { screenIs } from "../organization/render";

const home: PhoneDestination = { key: "home", href: "/", icon: HouseIcon, label: "Home", current: false };
const account = (current: boolean): PhoneDestination => ({
  key: "account",
  href: "/account",
  icon: UserIcon,
  label: "Your account",
  current,
});

function renderBar(onAccount: boolean) {
  screenIs("phone");
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SidebarProvider>
        <PhoneNavigation
          label="Main"
          moreLabel="More"
          destinations={[home]}
          moreOnly={[account(onAccount)]}
          title="Sharma Travels"
          description="Asha"
          signOut={{ label: "Sign out", onClick: () => undefined }}
        />
      </SidebarProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PhoneNavigation", () => {
  it("marks More current, in blue, when the page is one of its destinations", () => {
    renderBar(true);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-current", "true");
    expect(more).toHaveClass("text-primary");
  });

  it("leaves More as it is on a page in the bar", () => {
    renderBar(false);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).not.toHaveAttribute("aria-current");
    expect(more).toHaveClass("text-muted-foreground");
  });
});
