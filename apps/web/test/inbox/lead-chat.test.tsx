// The lead's WhatsApp section as the WhatsApp button's way in (web revamp): a customer with no chat yet is sent to
// leadChatRoute (the lead's page at #whatsapp), and the section, which appears only once its chat has loaded, brings
// itself into view then, since the browser's own jump to the anchor came before it existed.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadChat } from "@/inbox/lead-chat";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const leadId = "0199e7a0-0000-7000-8000-000000000001";
const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

function renderSection() {
  stubApi({ "inbox.leadChat": { data: { conversationId: null } } });
  renderWithApi(
    <LeadChat leadId={leadId} />,
    newQueryClient({ ...paidSubscription, modules: ["inbox"] }),
    member({ permissions: ["leads:view", "inbox:view"] }),
  );
}

describe("the lead's WhatsApp section", () => {
  it("brings itself into view when the page was opened at #whatsapp", async () => {
    window.history.replaceState(null, "", `/leads/${leadId}#whatsapp`);
    renderSection();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("No WhatsApp chat with this person yet.", { exact: false })).toBeVisible();
  });

  it("stays where it is on an ordinary visit", async () => {
    renderSection();
    expect(await screen.findByText("No WhatsApp chat with this person yet.", { exact: false })).toBeVisible();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("runs edge to edge inside its card on a phone, with side padding from sm up", async () => {
    renderSection();
    const text = await screen.findByText("No WhatsApp chat with this person yet.", { exact: false });
    const content = text.closest('[data-slot="card-content"]');
    expect(content).toHaveClass("px-0", "sm:px-(--card-spacing)");
  });
});
