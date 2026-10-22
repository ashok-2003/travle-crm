// The form's "Last 30 days" and its help text (spec 3.2 item 7, 15): four counts with what each means, the note that
// stopped enquiries are not kept, and the counts asked for again after a change.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { renderScreen } from "../../leads/screen";
import { stubApi } from "../../support/api-stub";
import { aWebsiteFormView, someSettings } from "./records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const t = messages.websiteFormSettings;

function render(counts: unknown = { data: { enquiries: 1234, newLeads: 1000, repeatEnquiries: 234, stopped: 17 } }) {
  const api = stubApi({
    "websiteForm.get": {
      data: aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "off" } }),
    },
    "websiteForm.turnOn": { data: aWebsiteFormView() },
    "websiteForm.counts": counts as never,
    "organization.logo.get": { data: null },
    "organization.branding.get": { data: null },
  });
  renderScreen(<WebsiteFormScreen />, { width: "wide" });
  return api;
}

describe("the counts", () => {
  it("shows the four counts in Indian grouping and the note about stopped enquiries", async () => {
    render();
    const section = await screen.findByRole("region", { name: t.counts.heading });
    expect(await within(section).findByText("1,234")).toBeVisible();
    expect(within(section).getByText("1,000")).toBeVisible();
    expect(within(section).getByText("234")).toBeVisible();
    expect(within(section).getByText("17")).toBeVisible();
    for (const label of [
      t.counts.enquiries.label,
      t.counts.newLeads.label,
      t.counts.repeatEnquiries.label,
      t.counts.stopped.label,
    ]) {
      expect(within(section).getByText(label)).toBeVisible();
      expect(within(section).getByRole("button", { name: `What does ${label} mean?` })).toBeVisible();
    }
    expect(within(section).getByText(t.counts.note)).toBeVisible();
  });

  it("loads again after a change to the form", async () => {
    const api = render();
    await screen.findByText("1,234");
    const before = api.calls.filter((path) => path === "websiteForm.counts").length;
    await userEvent.click(screen.getByRole("switch", { name: t.status.switch }));
    await waitFor(() => {
      expect(api.calls.filter((path) => path === "websiteForm.counts").length).toBeGreaterThan(before);
    });
  });

  it("says the counts did not load, with Try again, while the rest works", async () => {
    const api = render({ status: 500 });
    expect(await screen.findByText(t.counts.loadFailed)).toBeVisible();
    api.answer("websiteForm.counts", { data: { enquiries: 3, newLeads: 2, repeatEnquiries: 1, stopped: 0 } });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("3")).toBeVisible();
    expect(screen.getByRole("switch", { name: t.status.switch })).toBeVisible();
  });
});

describe("the help text", () => {
  it("tells the agency what the form means for them, and shows no Turnstile nudge", async () => {
    render();
    const help = await screen.findByRole("region", { name: t.help.heading });
    for (const sentence of [t.help.own, t.help.personalData, t.help.stopped, t.help.link]) {
      expect(within(help).getByText(sentence)).toBeVisible();
    }
    expect(screen.queryByText(/turnstile/i)).not.toBeInTheDocument();
    // The tickbox sentence follows the consent switch, which is off.
    expect(within(help).queryByText(t.help.tick)).not.toBeInTheDocument();
  });
});
