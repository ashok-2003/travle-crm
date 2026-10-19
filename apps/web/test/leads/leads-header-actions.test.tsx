// The Leads header's actions (spec 3.1): New lead stays the one primary button, for whoever may add leads, and Import
// and Export follow it as outline pills in one row that wraps, three to a 390px phone. Export is built; the Import slot
// still renders its stub until the lead import is.
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadsHeaderActions } from "@/leads/list/leads-header-actions";
import { routes } from "@/lib/routes";
import { member } from "../support/members";
import { address } from "./navigation";
import { stubApi } from "../support/api-stub";
import { renderScreen } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

beforeEach(() => {
  address.set("/leads");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadsHeaderActions", () => {
  it("keeps New lead the header's one primary button, followed by the Import and Export slots in one wrapping row", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />);
    const newLead = screen.getByRole("link", { name: messages.leads.newLead });
    expect(newLead).toHaveAttribute("href", routes.newLead);
    const row = newLead.parentElement;
    if (!row) throw new Error("New lead has no row");
    expect(row).toHaveClass("flex", "flex-wrap");
    expect(row.firstElementChild).toBe(newLead);
    const primaries = [...within(row).queryAllByRole("link"), ...within(row).queryAllByRole("button")].filter(
      (action) => action.dataset.variant === "default",
    );
    expect(primaries).toEqual([newLead]);
    // Export follows it as an outline pill in the same row.
    const exportButton = within(row).getByRole("button", { name: messages.leads.export.button });
    expect(exportButton.dataset.variant).toBe("outline");
    expect(row.lastElementChild).toBe(exportButton);
  });

  it("leaves New lead out for whoever may not add leads", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />, { me: member({ permissions: ["leads:view"] }) });
    expect(screen.queryByRole("link", { name: messages.leads.newLead })).toBeNull();
    // Whoever sees the list may export it.
    expect(screen.getByRole("button", { name: messages.leads.export.button })).toBeVisible();
  });

  it("leaves Export out for whoever may not see leads", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />, { me: member({ permissions: ["tasks:view"] }) });
    expect(screen.queryByRole("button", { name: messages.leads.export.button })).toBeNull();
  });
});
