// Reaching a lead's person (R48): WhatsApp opens the chat with their number, Call dials it on a phone and, on a
// computer, shows the number with Copy. Call is the main button and WhatsApp an outline one.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallButton, WhatsAppButton, whatsAppLink } from "@/leads/contact-buttons";
import { screenIs } from "../organization/render";
import { renderPiece } from "./render";

const phone = "+919876543210";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the contact buttons", () => {
  it("links WhatsApp to https://wa.me/919876543210, dials tel:+919876543210 on a phone, and shows the number with Copy on a computer", async () => {
    expect(whatsAppLink(phone)).toBe("https://wa.me/919876543210");
    screenIs("phone");
    const { unmount } = renderPiece(
      <>
        <CallButton phone={phone} name="Rahul Sharma" />
        <WhatsAppButton phone={phone} name="Rahul Sharma" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Call Rahul Sharma" })).toHaveAttribute("href", "tel:+919876543210");
    const whatsApp = screen.getByRole("link", { name: "WhatsApp Rahul Sharma" });
    expect(whatsApp).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(whatsApp).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(whatsApp).toHaveAttribute("data-variant", "outline");
    expect(screen.getByRole("link", { name: "Call Rahul Sharma" })).toHaveAttribute("data-variant", "default");
    unmount();

    screenIs("wide");
    renderPiece(<CallButton phone={phone} name="Rahul Sharma" />);
    await userEvent.click(screen.getByRole("button", { name: "Call Rahul Sharma" }));
    const shown = await screen.findByRole("dialog");
    expect(shown).toHaveTextContent("+91 98765 43210");
    expect(screen.getByRole("button", { name: "Copy Rahul Sharma's number" })).toBeVisible();
  });
});
