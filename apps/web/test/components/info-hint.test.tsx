// "What does this mean?" beside a term (InfoHint): a button named by its question, with a 44px hit area. With a mouse
// it is a tooltip, open on keyboard focus (and on hover) and kept open by a click; on a touch screen a tap opens a
// popover. Either way the words are announced with the button, and Escape closes them.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfoHint } from "@/components/info-hint";
import { locale, messages } from "@/i18n/messages";
import { targetSize } from "./touch-targets";

const words = "This person has enquired with your agency before.";

/** A screen with a mouse (it hovers) or a touch screen (it doesn't). */
function renderOn(screenKind: "mouse" | "touch") {
  const noop = () => undefined;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: screenKind === "mouse" && query.includes("hover: hover"),
    addEventListener: noop,
    removeEventListener: noop,
  }));
  // Radix measures what it positions; jsdom can't.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <p>
        Returning <InfoHint term="Returning">{words}</InfoHint>
      </p>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InfoHint", () => {
  it.each(["mouse", "touch"] as const)("is a button named by its question, 44px to touch (%s)", (screenKind) => {
    renderOn(screenKind);
    const button = screen.getByRole("button", { name: "What does Returning mean?" });
    const { width, height } = targetSize(button);
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(screen.queryByText(words)).toBeNull();
  });

  it("with a mouse, shows its words as the button's tooltip on keyboard focus, and Escape closes them", async () => {
    const user = userEvent.setup();
    renderOn("mouse");
    await user.tab();
    const button = screen.getByRole("button", { name: "What does Returning mean?" });
    expect(button).toHaveFocus();
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(words);
    expect(button).toHaveAccessibleDescription(words);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("with a mouse, stays open when clicked, where a tooltip would close", async () => {
    const user = userEvent.setup();
    renderOn("mouse");
    await user.click(screen.getByRole("button", { name: "What does Returning mean?" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(words);
  });

  it("on a touch screen, opens a popover named by the term on a tap, and Escape gives the focus back", async () => {
    const user = userEvent.setup();
    renderOn("touch");
    const button = screen.getByRole("button", { name: "What does Returning mean?" });
    await user.click(button);
    const popover = await screen.findByRole("dialog", { name: "Returning" });
    expect(popover).toHaveAccessibleDescription(words);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });
});
