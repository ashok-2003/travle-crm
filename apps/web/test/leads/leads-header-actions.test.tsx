// The Leads header's actions (spec 3.1): New lead stays the one primary button, for whoever may add leads, and Import
// and Export follow it as outline pills in one row that wraps, three to a 390px phone. Import shows to whoever may
// import (leads:create and leads:assign); the Export slot is the lead export's.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadsHeaderActions } from "@/leads/list/leads-header-actions";
import { routes } from "@/lib/routes";
import { member } from "../support/members";
import { stubApi } from "../support/api-stub";
import { renderScreen } from "./screen";

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
  });

  it("puts Import after New lead in the same row, an outline pill, for whoever may import", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />);
    const newLead = screen.getByRole("link", { name: messages.leads.newLead });
    const importLink = screen.getByRole("link", { name: messages.leads.import.button });
    expect(importLink).toHaveAttribute("href", routes.leadImport);
    expect(importLink.dataset.variant).toBe("outline");
    expect(importLink.parentElement).toBe(newLead.parentElement);
    expect(newLead.nextElementSibling).toBe(importLink);
  });

  it("leaves Import out for whoever may add leads but not give them to others", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />, { me: member({ permissions: ["leads:view", "leads:create"] }) });
    expect(screen.getByRole("link", { name: messages.leads.newLead })).toBeVisible();
    expect(screen.queryByRole("link", { name: messages.leads.import.button })).toBeNull();
  });

  it("leaves New lead out for whoever may not add leads", () => {
    stubApi({});
    renderScreen(<LeadsHeaderActions />, { me: member({ permissions: ["leads:view"] }) });
    expect(screen.queryByRole("link", { name: messages.leads.newLead })).toBeNull();
  });
});
