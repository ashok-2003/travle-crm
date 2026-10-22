// The form's settings on its page (spec 3.2, items 3 to 5): the six questions as Off, Optional or Required, the agency's
// words with their counts and https checks, the look read from the profile, and Save: what it sends, when it is off, and
// the one question when leaving with unsaved changes.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { routes } from "@/lib/routes";
import { lastInputTo, renderScreen } from "../../leads/screen";
import { routerCalls } from "../../leads/navigation";
import { paidSubscription } from "../../organization/api";
import { stubApi } from "../../support/api-stub";
import { aWebsiteFormView, someSettings } from "./records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
  routerCalls.push.mockClear();
});

const t = messages.websiteFormSettings;

function render(options: Parameters<typeof renderScreen>[1] = {}) {
  const saved = aWebsiteFormView({ settings: someSettings({ heading: "Come to Goa" }) });
  const api = stubApi({
    "websiteForm.get": { data: aWebsiteFormView() },
    "websiteForm.counts": { data: { enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 } },
    "websiteForm.save": { data: saved },
    "organization.logo.get": { data: null },
    "organization.branding.get": { data: { brandColour: "#1f6f5c", documentTerms: null } },
  });
  renderScreen(<WebsiteFormScreen />, { width: "wide", ...options });
  return api;
}

const saveButton = () => screen.getByRole("button", { name: t.save.save });

describe("the form's settings", () => {
  it("asks Name and Phone always, and offers Off, Optional or Required for the six others", async () => {
    render();
    const group = await screen.findByRole("list", { name: t.fields.heading });
    expect(within(group).getAllByText(t.fields.alwaysAsked)).toHaveLength(2);
    expect(within(group).getByRole("combobox", { name: t.fields.email })).toHaveTextContent(t.fields.modes.optional);
    expect(within(group).getByRole("combobox", { name: t.fields.budget })).toHaveTextContent(t.fields.modes.off);
    expect(within(group).getAllByRole("combobox")).toHaveLength(6);
  });

  it("sends the settings with the changed one on Save, never `enabled`, and says it is saved", async () => {
    render();
    await userEvent.type(await screen.findByLabelText(t.words.formHeading), "Come to Goa");
    await userEvent.click(saveButton());
    await waitFor(() => {
      expect(lastInputTo("websiteForm.save")).toMatchObject({ heading: "Come to Goa", emailMode: "optional" });
    });
    expect(lastInputTo("websiteForm.save")).not.toHaveProperty("enabled");
    expect(await screen.findByText(t.save.saved)).toBeVisible();
    // The saved settings are the new starting point: nothing to save again.
    await waitFor(() => {
      expect(saveButton()).toBeDisabled();
    });
  });

  it("changes a question's mode", async () => {
    render();
    await userEvent.click(await screen.findByRole("combobox", { name: t.fields.budget }));
    await userEvent.click(await screen.findByRole("option", { name: t.fields.modes.required }));
    await userEvent.click(saveButton());
    await waitFor(() => {
      expect(lastInputTo("websiteForm.save")).toMatchObject({ budgetMode: "required" });
    });
  });

  it("shows a link that isn't https as an error under its field, and sends nothing", async () => {
    const api = render();
    await userEvent.type(await screen.findByLabelText(t.words.websiteUrl), "http://sharma.example");
    await userEvent.click(saveButton());
    expect(await screen.findByText(messages.errors.reasons.FORM_LINK_INVALID)).toBeVisible();
    expect(api.calls).not.toContain("websiteForm.save");
  });

  it("disables Save when nothing changed", async () => {
    render();
    await screen.findByLabelText(t.words.formHeading);
    expect(saveButton()).toBeDisabled();
  });

  it("disables Save while read-only, with the hint as its description", async () => {
    render({ subscription: { ...paidSubscription, access: "read_only" } });
    await userEvent.type(await screen.findByLabelText(t.words.formHeading), "x");
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });

  it("counts the characters of the heading, the introduction and the thank-you", async () => {
    render();
    const heading = await screen.findByLabelText(t.words.formHeading);
    expect(screen.getByText("0 of 80")).toBeVisible();
    expect(screen.getByText("0 of 200")).toBeVisible();
    expect(screen.getByText("0 of 500")).toBeVisible();
    await userEvent.type(heading, "Goa");
    expect(screen.getByText("3 of 80")).toBeVisible();
  });

  it("shows the look from the profile: the logo's absence, the name and the colour", async () => {
    render();
    expect(await screen.findByText(t.look.noLogo)).toBeVisible();
    expect(await screen.findByText("#1f6f5c")).toBeVisible();
    expect(screen.getByText("Sharma Travels")).toBeVisible();
    expect(screen.getByRole("link", { name: t.look.changeProfile })).toHaveAttribute("href", routes.profile);
    expect(screen.getByRole("link", { name: t.look.changeBranding })).toHaveAttribute("href", routes.branding);
  });

  it("leaves without asking when nothing changed", async () => {
    render();
    await userEvent.click(await screen.findByRole("link", { name: t.page.back }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks once when leaving with unsaved changes, and Cancel stays", async () => {
    render();
    await userEvent.type(await screen.findByLabelText(t.words.formHeading), "x");
    await userEvent.click(screen.getByRole("link", { name: t.page.back }));
    const dialog = await screen.findByRole("alertdialog", { name: t.save.leave.title });
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.cancel }));
    expect(routerCalls.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t.words.formHeading)).toHaveValue("x");
    await userEvent.click(screen.getByRole("link", { name: t.page.back }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.save.leave.leave }),
    );
    expect(routerCalls.push).toHaveBeenCalledWith(routes.leadSources);
  });

  it("shows no offers switch while the consent switch is off", async () => {
    render();
    await screen.findByRole("list", { name: t.fields.heading });
    expect(screen.queryByRole("switch", { name: t.fields.offers })).not.toBeInTheDocument();
  });
});
