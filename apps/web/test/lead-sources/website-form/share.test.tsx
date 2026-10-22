// Sharing the form (spec 3.2 item 2, 3.3): the address with Copy, Open and Change the link, the switch that lets the
// agency's website show it, and the snippet for the website in its two forms.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { renderScreen } from "../../leads/screen";
import { paidSubscription } from "../../organization/api";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { aWebsiteFormView, formKey, someSettings } from "./records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const t = messages.websiteFormSettings;
const scriptTag = `<script src="https://app.example/embed.js" data-form="${formKey}" async></script>`;
const iframeTag = `<iframe src="https://app.example/embed/${formKey}" title="Enquiry form" width="100%" height="760" style="border:0" loading="lazy"></iframe>`;

function render(
  view = aWebsiteFormView(),
  extra: Parameters<typeof stubApi>[0] = {},
  options: Parameters<typeof renderScreen>[1] = {},
) {
  const api = stubApi({
    "websiteForm.get": { data: view },
    "websiteForm.counts": { data: { enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 } },
    "organization.logo.get": { data: null },
    "organization.branding.get": { data: null },
    ...extra,
  });
  renderScreen(<WebsiteFormScreen />, { width: "wide", ...options });
  return api;
}

describe("the Share card", () => {
  it("shows the address, with Open in a new tab that keeps the page out of reach", async () => {
    render();
    expect(await screen.findByRole("textbox", { name: t.share.linkLabel })).toHaveValue(aWebsiteFormView().link);
    const open = screen.getByRole("link", { name: t.share.open });
    expect(open).toHaveAttribute("href", aWebsiteFormView().link);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
  });

  it("says the link appears later for a form never saved", async () => {
    render(aWebsiteFormView({ key: null, link: null, embedLink: null }));
    expect(await screen.findByText(t.share.noLink)).toBeVisible();
    expect(screen.queryByRole("link", { name: t.share.open })).not.toBeInTheDocument();
  });

  it("copies the link", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: t.share.copyLink }));
    expect(await navigator.clipboard.readText()).toBe(aWebsiteFormView().link);
  });

  it("holds the Change the link question while it is pending, then shows the new link", async () => {
    const held = heldAnswer({
      data: aWebsiteFormView({
        link: "https://app.example/f/NEWKEY",
        embedLink: "https://app.example/embed/NEWKEY",
        key: "NEWKEY",
      }),
    });
    render(aWebsiteFormView(), { "websiteForm.changeLink": held.answer });
    await userEvent.click(await screen.findByRole("button", { name: t.share.changeLink }));
    const dialog = await screen.findByRole("alertdialog", { name: t.share.changeDialog.title });
    expect(dialog).toHaveTextContent(t.share.changeDialog.description);
    await userEvent.click(within(dialog).getByRole("button", { name: t.share.changeDialog.action }));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    });
    expect(within(dialog).getByRole("button", { name: t.share.changeDialog.action })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: t.share.linkLabel })).toHaveValue("https://app.example/f/NEWKEY");
  });

  it("keeps Change the link open while the agency is read-only", async () => {
    render(aWebsiteFormView(), {}, { subscription: { ...paidSubscription, access: "read_only" } });
    expect(await screen.findByRole("button", { name: t.share.changeLink })).toBeEnabled();
  });

  it("returns the focus to Change the link after the question closes", async () => {
    render();
    const button = await screen.findByRole("button", { name: t.share.changeLink });
    await userEvent.click(button);
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: messages.common.cancel }),
    );
    await waitFor(() => {
      expect(button).toHaveFocus();
    });
  });
});

describe("the snippet", () => {
  it("carries the key and the api's own address (not the browser's) in the script and in the iframe", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: t.share.copySnippet }));
    const dialog = await screen.findByRole("dialog", { name: t.snippet.title });
    expect(within(dialog).getByText(scriptTag)).toBeVisible();
    expect(within(dialog).getByText(t.snippet.scriptHelp)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("tab", { name: t.snippet.iframe }));
    expect(within(dialog).getByText(iframeTag)).toBeVisible();
    expect(within(dialog).getByText(t.snippet.iframeHelp)).toBeVisible();
    expect(within(dialog).getByText(t.snippet.works)).toBeVisible();
  });

  it("copies the exact text", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: t.share.copySnippet }));
    await user.click(await screen.findByRole("button", { name: t.snippet.copyScript }));
    expect(await navigator.clipboard.readText()).toBe(scriptTag);
    await user.click(screen.getByRole("tab", { name: t.snippet.iframe }));
    await user.click(screen.getByRole("button", { name: t.snippet.copyIframe }));
    expect(await navigator.clipboard.readText()).toBe(iframeTag);
  });

  it("says the snippet is off while embedding is off, and offers the switch", async () => {
    render(aWebsiteFormView({ settings: someSettings({ allowEmbed: false }) }));
    await userEvent.click(await screen.findByRole("button", { name: t.share.copySnippet }));
    const dialog = await screen.findByRole("dialog", { name: t.snippet.title });
    expect(within(dialog).getByText(t.snippet.off)).toBeVisible();
    expect(within(dialog).queryByText(scriptTag)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("switch", { name: t.share.embed }));
    expect(await within(dialog).findByText(scriptTag)).toBeVisible();
    expect(within(dialog).getByText(t.snippet.saveToApply)).toBeVisible();
  });
});
