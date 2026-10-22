// The offers consent on a person's card (website form spec 3.9): who agreed and when, from the website form, with the way
// to record that they stopped; a person who withdrew shows one sentence; one who never agreed shows nothing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { PersonConsent } from "@/leads/lead/person-consent";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { aLead } from "./records";
import { lastInputTo, owner, renderScreen, salesperson } from "./screen";

vi.mock("@travel-crm/contracts/features", () => ({ features: { marketingConsent: true } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.websiteFormSettings.consent;
const leadId = aLead().id;
const granted = { state: "granted", at: "2026-10-22T05:00:00.000Z", fromForm: true };
const withdrawn = { state: "withdrawn", at: "2026-11-03T05:00:00.000Z", fromForm: true };
const never = { state: null, at: null, fromForm: false };

function render(consent: unknown, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "people.consent": { data: consent },
    "people.withdrawConsent": { data: withdrawn },
  });
  renderScreen(<PersonConsent leadId={leadId} personName="Rahul Sharma" />, { me: owner, ...options });
  return api;
}

describe("PersonConsent", () => {
  it("shows the line and the button for a person who agreed through the form", async () => {
    render(granted);
    expect(await screen.findByText("Agreed to offers on 22 Oct, from the website form")).toBeVisible();
    expect(screen.getByRole("button", { name: words.stopped })).toBeEnabled();
  });

  it("leaves out 'from the website form' for a person who did not use it", async () => {
    render({ ...granted, fromForm: false });
    expect(await screen.findByText("Agreed to offers on 22 Oct")).toBeVisible();
  });

  it("shows nothing for a person who never agreed", async () => {
    const api = render(never);
    await waitFor(() => {
      expect(api.calls).toContain("people.consent");
    });
    expect(screen.queryByText(words.label)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: words.stopped })).not.toBeInTheDocument();
  });

  it("shows the one sentence for a person who withdrew, with no button", async () => {
    render(withdrawn);
    expect(await screen.findByText("Asked to stop offers on 3 Nov")).toBeVisible();
    expect(screen.queryByRole("button", { name: words.stopped })).not.toBeInTheDocument();
  });

  it("records that they stopped after one question, and loads the lead again", async () => {
    const api = render(granted);
    await userEvent.click(await screen.findByRole("button", { name: words.stopped }));
    const dialog = await screen.findByRole("alertdialog", { name: words.confirm.title });
    await userEvent.click(within(dialog).getByRole("button", { name: words.confirm.action }));
    await waitFor(() => {
      expect(lastInputTo("people.withdrawConsent")).toEqual({ leadId });
    });
    expect(await screen.findByText("Asked to stop offers on 3 Nov")).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // leads.* (the lead's page) is asked for again.
    expect(api.calls).toContain("people.withdrawConsent");
  });

  it("needs leads:edit: a member who only views sees the line without the button", async () => {
    render(granted, {
      me: {
        ...salesperson,
        member: { ...salesperson.member, permissions: [{ permission: "leads:view", scope: "all" }] },
      },
    });
    expect(await screen.findByText(/Agreed to offers on 22 Oct/)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.stopped })).not.toBeInTheDocument();
  });

  it("turns the button off while the subscription refuses changes, saying why", async () => {
    render(granted, { subscription: { ...paidSubscription, access: "read_only" } });
    const button = await screen.findByRole("button", { name: words.stopped });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });
});
