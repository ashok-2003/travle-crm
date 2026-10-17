// The one New lead button (leads/new-lead-button.tsx), Leads' primary action and Home's outline one: a link to the
// new-lead form, its words leads.newLead wherever it sits.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { NewLeadButton } from "@/leads/new-lead-button";
import { routes } from "@/lib/routes";
import { stubApi } from "../support/api-stub";
import { renderScreen } from "./screen";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewLeadButton", () => {
  it("leads to the new-lead form, as the screen's primary action by default", () => {
    stubApi({});
    renderScreen(<NewLeadButton />);
    const link = screen.getByRole("link", { name: messages.leads.newLead });
    expect(link).toHaveAttribute("href", routes.newLead);
    expect(link.dataset.variant).toBe("default");
  });

  it("is an outline button where another action is the main one (Home's Open Today)", () => {
    stubApi({});
    renderScreen(<NewLeadButton variant="outline" />);
    expect(screen.getByRole("link", { name: messages.leads.newLead }).dataset.variant).toBe("outline");
  });
});
