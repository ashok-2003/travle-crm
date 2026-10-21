// The Leads header's Import (spec 3.1): for whoever holds both leads:create and leads:assign, an outline link to the
// import's first step; off, with the subscription's reason, while the agency can't make changes.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadImportButton } from "@/leads/import/lead-import-button";
import { routes } from "@/lib/routes";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { stubApi } from "../../support/api-stub";
import { member } from "../../support/members";
import { renderScreen } from "../screen";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadImportButton", () => {
  it("shows Import to holders of leads:create and leads:assign", () => {
    stubApi({});
    renderScreen(<LeadImportButton />, { me: member({ permissions: ["leads:create", "leads:assign"] }) });
    const link = screen.getByRole("link", { name: messages.leads.import.button });
    expect(link).toHaveAttribute("href", routes.leadImport);
    expect(link.dataset.variant).toBe("outline");
  });

  it("is left out for whoever holds only one of them", () => {
    stubApi({});
    renderScreen(<LeadImportButton />, { me: member({ permissions: ["leads:create"] }) });
    expect(screen.queryByRole("link", { name: messages.leads.import.button })).toBeNull();
    expect(screen.queryByRole("button", { name: messages.leads.import.button })).toBeNull();
  });

  it("is off with its hint while the agency can't make changes", () => {
    stubApi({});
    renderWithApi(
      <LeadImportButton />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
      member({ isOwner: true }),
    );
    expect(screen.getByRole("button", { name: messages.leads.import.button })).toBeDisabled();
    expect(screen.queryByRole("link", { name: messages.leads.import.button })).toBeNull();
    expect(screen.getByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
  });
});
