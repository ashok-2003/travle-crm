// Reaching a lead's person (R48, release 5): WhatsApp opens the chat with their number; Call dials it on a phone, and
// remembers the call so "How did the call go?" follows the person back; on a computer it opens the call panel: the
// number with Copy, Send to my phone, a QR code that dials, and Log the call. Call is the main button, WhatsApp outline.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallButton, WhatsAppButton, whatsAppLink } from "@/leads/contact-buttons";
import { takePendingCall } from "@/leads/call/pending-call";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { sentInputs } from "../notifications/sent-inputs";
import { stubApi } from "../support/api-stub";

const phone = "+919876543210";
const leadId = "0199e7a0-0000-7000-8000-000000000001";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the contact buttons", () => {
  it("links WhatsApp to https://wa.me/919876543210 and dials tel:+919876543210 on a phone", () => {
    expect(whatsAppLink(phone)).toBe("https://wa.me/919876543210");
    screenIs("phone");
    stubApi({});
    renderWithApi(
      <>
        <CallButton phone={phone} name="Rahul Sharma" leadId={leadId} />
        <WhatsAppButton phone={phone} name="Rahul Sharma" />
      </>,
      newQueryClient(),
    );
    const call = screen.getByRole("link", { name: "Call Rahul Sharma" });
    expect(call).toHaveAttribute("href", "tel:+919876543210");
    expect(call).toHaveAttribute("data-variant", "default");
    const whatsApp = screen.getByRole("link", { name: "WhatsApp Rahul Sharma" });
    expect(whatsApp).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(whatsApp).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(whatsApp).toHaveAttribute("data-variant", "outline");
  });

  it("remembers a call started on a phone, for the question on coming back, and only for half an hour", async () => {
    screenIs("phone");
    stubApi({});
    renderWithApi(<CallButton phone={phone} name="Rahul Sharma" leadId={leadId} />, newQueryClient());
    const link = screen.getByRole("link", { name: "Call Rahul Sharma" });
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    expect(takePendingCall(Date.now() + 29 * 60_000)).toEqual({ leadId, name: "Rahul Sharma" });
    // Asking forgets it, so the question comes once.
    expect(takePendingCall()).toBeNull();
    await userEvent.click(link);
    expect(takePendingCall(Date.now() + 31 * 60_000)).toBeNull();
  });

  it("opens the call panel on a computer: the number, Copy, a QR code that dials, and Send to my phone", async () => {
    screenIs("wide");
    const api = stubApi({
      "notifications.push.hasDevice": { data: true },
      "calls.sendToMyPhone": { data: null },
    });
    renderWithApi(<CallButton phone={phone} name="Rahul Sharma" leadId={leadId} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Call Rahul Sharma" }));
    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveTextContent("+91 98765 43210");
    expect(within(panel).getByRole("button", { name: "Copy Rahul Sharma's number" })).toBeVisible();
    expect(within(panel).getByRole("img", { name: "A QR code that dials Rahul Sharma" })).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Dial from this device" })).toHaveAttribute(
      "href",
      "tel:+919876543210",
    );
    const send = within(panel).getByRole("button", { name: "Send to my phone" });
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await userEvent.click(send);
    await waitFor(() => {
      expect(sentInputs("calls.sendToMyPhone")).toEqual([{ leadId }]);
    });
    expect(api.calls).toContain("calls.sendToMyPhone");
  });

  it("turns Send to my phone off, and says where to turn on notifications, when no phone is registered", async () => {
    screenIs("wide");
    stubApi({ "notifications.push.hasDevice": { data: false } });
    renderWithApi(<CallButton phone={phone} name="Rahul Sharma" leadId={leadId} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Call Rahul Sharma" }));
    const send = await screen.findByRole("button", { name: "Send to my phone" });
    await waitFor(() => {
      expect(send).toBeDisabled();
    });
    expect(screen.getByText(/Turn on notifications on your phone first/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Turn on notifications" })).toHaveAttribute(
      "href",
      "/account/notifications",
    );
  });
});
