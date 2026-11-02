// A lead's page asks for its cards' data in the same batch as the lead, not after it; a card the plan or role lacks is
// not asked for.
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadScreen } from "@/leads/lead/lead-screen";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { ids } from "./records";
import { owner, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

/** The procedures of each request the screen has sent, in order. */
const batches = () =>
  vi.mocked(globalThis.fetch).mock.calls.map(([input]) =>
    decodeURIComponent(new URL(input instanceof Request ? input.url : String(input), "http://localhost").pathname)
      .slice("/api/trpc/".length)
      .split(","),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadScreen's first requests", () => {
  it("ask for every card's data together with the lead", async () => {
    address.set(`/leads/${ids.rahul}`);
    stubApi({ "leads.get": "never" });
    const modules = ["crm", "quotes", "bookings", "departures", "inbox", "ai"] as const;
    renderScreen(<LeadScreen leadId={ids.rahul} />, {
      me: owner,
      subscription: { ...paidSubscription, modules: [...modules] },
    });
    await waitFor(() => {
      expect(batches().length).toBeGreaterThan(0);
    });
    expect(batches()).toHaveLength(1);
    expect(new Set(batches()[0])).toEqual(
      new Set([
        "leads.get",
        "sales.forLead",
        "ai.bookingsForLead",
        "leads.timeline",
        "ai.leadInsight",
        "ai.leadFields",
        "quotes.forLead",
        "quotes.settings",
        "quotes.packages",
        "bookings.forLead",
        "departures.forLead",
        "inbox.leadChat",
      ]),
    );
  });

  it("leaves out the cards a role or plan lacks", async () => {
    address.set(`/leads/${ids.rahul}`);
    stubApi({ "leads.get": "never" });
    renderScreen(<LeadScreen leadId={ids.rahul} />, {
      me: salesperson,
      subscription: { ...paidSubscription, modules: ["crm"] },
    });
    await waitFor(() => {
      expect(batches().length).toBeGreaterThan(0);
    });
    expect(new Set(batches()[0])).toEqual(
      new Set(["leads.get", "sales.forLead", "ai.bookingsForLead", "leads.timeline"]),
    );
  });
});
