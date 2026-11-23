// The contact panel beside a chat shows the lead through the lead page's own parts, as it did before the lead page's
// revamp (2026-11-21): Next follow-up with the open work alone, and the timeline without its filters, which the narrow
// panel can't hold. It asks for nothing the lead page alone needs: no sales, no lead chat (the chat is beside it).
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ContactPanel } from "@/inbox/contact-panel";
import { paidSubscription } from "../organization/api";
import { aLead, aTimeline, ids } from "../leads/records";
import { renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";

const header: ConversationHeader = {
  id: "0199e7a0-0000-7000-8000-000000000f01",
  phone: "+919876543210",
  name: "Rahul Sharma",
  personId: ids.person,
  lead: { id: ids.rahul, stage: "new", ownerUserId: null, open: true },
  pastCustomer: false,
  liveLead: null,
  windowOpenUntil: null,
  lastInboundAt: null,
  needsReply: false,
  trip: { destination: null, travelMonth: null },
  optedOut: false,
  agreed: false,
  state: "open",
  tags: [],
  pinned: false,
  archived: false,
  snoozedUntil: null,
  replying: [],
  number: { id: "01900000-0000-7000-8000-0000000000aa", label: "WhatsApp", status: "connected" },
  otherChats: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the inbox's contact panel", () => {
  it("shows Next follow-up's open work and the timeline without filters, and asks for no sales or lead chat", async () => {
    const api = stubApi({ "leads.get": { data: aLead() }, "leads.timeline": aTimeline([]) });
    renderScreen(<ContactPanel header={header} />, {
      width: "wide",
      subscription: { ...paidSubscription, modules: ["inbox", "ai"] },
    });
    const work = await screen.findByRole("region", { name: messages.leads.lead.work.title });
    expect(within(work).getByText(messages.leads.lead.work.none)).toBeVisible();
    expect(within(work).queryByText(messages.leads.lead.followUps.lastContact)).not.toBeInTheDocument();
    const timeline = screen.getByRole("region", { name: messages.leads.lead.timeline.title });
    expect(within(timeline).queryByRole("radio")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.calls).toContain("leads.timeline");
    });
    expect(api.calls).not.toContain("sales.forLead");
    expect(api.calls).not.toContain("inbox.leadChat");
  });
});
