// A lead's page puts the Quotes card above the WhatsApp card, with New quote as its primary button, and names a quote
// waiting for payment; an older api that sends no paymentWait still shows Draft.
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { address } from "../leads/navigation";
import { aLead, aTimeline, ids } from "../leads/records";
import { renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const quote = (id: string, paymentWait?: "waiting" | "hold_expired" | null) => ({
  id,
  leadId: ids.rahul,
  customerName: "Rahul Sharma",
  title: "Spiti circuit",
  startDate: null,
  status: "draft",
  ...(paymentWait === undefined ? {} : { paymentWait }),
  totals: { subtotalPaise: 0, taxPaise: 0, totalPaise: 1_000_000, paidPaise: 0, balancePaise: 1_000_000 },
  updatedAt: "2026-11-26T08:00:00.000Z",
});

async function renderLead(quotes: unknown[]) {
  stubApi({
    "leads.get": { data: aLead() },
    "leads.timeline": aTimeline([]),
    "inbox.leadChat": { data: { conversationId: null } },
    "quotes.forLead": { data: quotes },
    "quotes.packages": { data: [] },
    "quotes.settings": { data: { defaultTaxRateBasisPoints: 500 } },
  });
  renderScreen(<LeadScreen leadId={ids.rahul} />, {
    width: "phone",
    subscription: { ...paidSubscription, modules: ["quotes", "inbox"] },
  });
  return screen.findByRole("region", { name: messages.quotes.lead.title });
}

beforeEach(() => {
  address.set(`/leads/${ids.rahul}`);
});

describe("a lead's Quotes card", () => {
  it("sits above the WhatsApp card, and New quote is its primary button", async () => {
    const card = await renderLead([]);
    await waitFor(() => {
      expect(document.getElementById("whatsapp")).not.toBeNull();
    });
    const whatsapp = document.getElementById("whatsapp") as Node;
    expect(card.compareDocumentPosition(whatsapp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByRole("button", { name: messages.quotes.lead.new })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  it("names a quote waiting for payment, or whose hold expired", async () => {
    const card = await renderLead([quote("0199a000-0000-7000-8000-000000000011", "waiting")]);
    expect(await within(card).findByText(messages.quotes.status.waiting)).toBeVisible();
  });

  it("shows Draft when an older api sends no paymentWait", async () => {
    const card = await renderLead([quote("0199a000-0000-7000-8000-000000000012")]);
    expect(await within(card).findByText(messages.quotes.status.draft)).toBeVisible();
    await waitFor(() => {
      expect(within(card).queryByText(messages.quotes.status.waiting)).toBeNull();
    });
  });
});
