// The offers switch on the form's page (spec 0.1.2, W25): present once the consent switch is on, with the sentence a
// visitor will read under it, and sent with Save.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { lastInputTo, renderScreen } from "../../leads/screen";
import { stubApi } from "../../support/api-stub";
import { aWebsiteFormView } from "./records";

vi.mock("@travel-crm/contracts/features", () => ({ features: { marketingConsent: true } }));
vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the offers switch", () => {
  it("shows the sentence visitors read and is sent with Save", async () => {
    stubApi({
      "websiteForm.get": { data: aWebsiteFormView() },
      "websiteForm.save": { data: aWebsiteFormView() },
      "websiteForm.counts": { data: { enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 } },
      "organization.logo.get": { data: null },
      "organization.branding.get": { data: null },
    });
    renderScreen(<WebsiteFormScreen />, { width: "wide" });
    const toggle = await screen.findByRole("switch", { name: messages.websiteFormSettings.fields.offers });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Send me travel offers and updates from Sharma Travels\./)).toBeVisible();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: messages.websiteFormSettings.save.save }));
    await waitFor(() => {
      expect(lastInputTo("websiteForm.save")).toMatchObject({ offersTickbox: true });
    });
  });
});
