// The website form's page (spec 3.2) and its row on Lead sources (3.1): the row's badge, a page with no saved form, the
// status switch turning the form on at once and off without a question, the closed states in words, and what stays
// open while the agency is read-only.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import WebsiteFormPage from "@/app/(app)/settings/lead-sources/website-form/page";
import { LeadSourcesScreen } from "@/lead-sources/lead-sources-screen";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { routes } from "@/lib/routes";
import { renderScreen, salesperson } from "../../leads/screen";
import { paidSubscription } from "../../organization/api";
import { member } from "../../support/members";
import { stubApi } from "../../support/api-stub";
import { aWebsiteFormView, someSettings } from "./records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const row = messages.websiteFormSettings.row;
const status = messages.websiteFormSettings.status;
const noSheets = { data: { items: [], limit: 5, serviceAccountEmails: [], configured: true, demo: false } };

function renderRow(view: unknown) {
  stubApi({ "leadSheets.list": noSheets, "websiteForm.get": view === "error" ? { status: 500 } : { data: view } });
  return renderScreen(<LeadSourcesScreen />, { width: "wide" });
}

function renderPage(view: unknown, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "websiteForm.get":
      view === "error"
        ? { status: 500 }
        : view === "refused"
          ? { status: 403, reason: "MISSING_PERMISSION" }
          : { data: view },
    "websiteForm.counts": { data: { enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 } },
    "websiteForm.turnOn": { data: aWebsiteFormView() },
    "websiteForm.turnOff": {
      data: aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "off" } }),
    },
  });
  renderScreen(<WebsiteFormScreen />, { width: "wide", ...options });
  return api;
}

describe("the Website form row on Lead sources", () => {
  it("shows On, Off or Unavailable and links to the form's page", async () => {
    const { unmount } = renderRow(aWebsiteFormView());
    expect(await screen.findByText(row.badges.on)).toBeVisible();
    expect(screen.getByText(row.on)).toBeVisible();
    expect(screen.getByRole("link", { name: new RegExp(row.title) })).toHaveAttribute("href", routes.websiteForm);
    unmount();

    const off = renderRow(aWebsiteFormView({ state: { open: false, reason: "off" } }));
    // The badge and the line under the name both say Off.
    expect(await screen.findAllByText(row.badges.off)).toHaveLength(2);
    off.unmount();

    renderRow(aWebsiteFormView({ state: { open: false, reason: "read_only" } }));
    expect(await screen.findByText(row.badges.unavailable)).toBeVisible();
  });

  it("is left out for a member who may not manage settings", async () => {
    stubApi({ "leadSheets.list": noSheets });
    renderScreen(<LeadSourcesScreen />, { me: salesperson, width: "wide" });
    expect(await screen.findByText(messages.sheets.list.empty)).toBeVisible();
    expect(screen.queryByText(row.title)).not.toBeInTheDocument();
  });

  it("sends no request for the form to a member without settings:manage or without leads:create", async () => {
    for (const permissions of [
      ["leads:create", "leads:assign"],
      ["settings:manage", "leads:assign"],
    ]) {
      const api = stubApi({ "leadSheets.list": noSheets });
      const { unmount } = renderScreen(<LeadSourcesScreen />, { me: member({ permissions }), width: "wide" });
      expect(await screen.findByText(messages.sheets.list.empty)).toBeVisible();
      expect(api.calls).not.toContain("websiteForm.get");
      expect(screen.queryByText(row.title)).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("WebsiteFormScreen", () => {
  it("shows the defaults for a page with no saved form, and writes nothing", async () => {
    const api = renderPage(
      aWebsiteFormView({
        key: null,
        link: null,
        embedLink: null,
        settings: someSettings({ enabled: false }),
        state: { open: false, reason: "off" },
      }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: messages.websiteFormSettings.page.title }),
    ).toBeVisible();
    expect(screen.getByText(status.off)).toBeVisible();
    expect(screen.getByRole("switch", { name: status.switch })).not.toBeChecked();
    expect(api.calls.filter((path) => /turnOn|turnOff|save|changeLink/.test(path))).toEqual([]);
  });

  it("names the Owner the leads go to, in the intro", async () => {
    renderPage(aWebsiteFormView());
    expect(await screen.findByText("Every enquiry becomes a lead for Asha Sharma.", { exact: false })).toBeVisible();
  });

  it("turns on at once", async () => {
    const api = renderPage(
      aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "off" } }),
    );
    await userEvent.click(await screen.findByRole("switch", { name: status.switch }));
    await waitFor(() => {
      expect(api.calls).toContain("websiteForm.turnOn");
    });
    expect(await screen.findByText(status.on)).toBeVisible();
  });

  it("turns off without a question", async () => {
    const api = renderPage(aWebsiteFormView());
    await userEvent.click(await screen.findByRole("switch", { name: status.switch }));
    await waitFor(() => {
      expect(api.calls).toContain("websiteForm.turnOff");
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByText(status.off)).toBeVisible();
  });

  it("says Closed in an Alert while the subscription makes the form read-only", async () => {
    renderPage(aWebsiteFormView({ state: { open: false, reason: "read_only" } }));
    expect(await screen.findByRole("alert")).toHaveTextContent(status.closed.read_only);
  });

  it("keeps the turn-off switch open while read-only, and turns turning on off with its hint", async () => {
    const readOnly = { ...paidSubscription, access: "read_only" as const };
    renderPage(aWebsiteFormView(), { subscription: readOnly });
    expect(await screen.findByRole("switch", { name: status.switch })).toBeEnabled();
    expect(screen.getByRole("switch", { name: status.switch })).toBeChecked();
  });

  it("disables turning on while read-only, saying why", async () => {
    const readOnly = { ...paidSubscription, access: "read_only" as const };
    renderPage(
      aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "read_only" } }),
      {
        subscription: readOnly,
      },
    );
    const toggle = await screen.findByRole("switch", { name: status.switch });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(new RegExp(messages.errors.reasons.ORGANIZATION_READ_ONLY.slice(0, 20)));
  });

  it("disables the demo's switch with 'Not available in the demo'", async () => {
    renderPage(
      aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "demo" } }),
    );
    const toggle = await screen.findByRole("switch", { name: status.switch });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription(status.demo);
  });

  it("shows the FORM_NEEDS_OWNER sentence when there is no Owner", async () => {
    renderPage(aWebsiteFormView({ ownerName: null, state: { open: false, reason: "no_owner" } }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.reasons.FORM_NEEDS_OWNER);
  });

  it("shows a refusal of turning on under the switch", async () => {
    const api = renderPage(
      aWebsiteFormView({ settings: someSettings({ enabled: false }), state: { open: false, reason: "off" } }),
    );
    api.answer("websiteForm.turnOn", { status: 409, reason: "FORM_NEEDS_OWNER" });
    await userEvent.click(await screen.findByRole("switch", { name: status.switch }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.reasons.FORM_NEEDS_OWNER);
  });

  it("shows an error with Try again", async () => {
    const api = renderPage("error");
    expect(await screen.findByText(messages.websiteFormSettings.page.loadFailed)).toBeVisible();
    api.answer("websiteForm.get", { data: aWebsiteFormView() });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("switch", { name: status.switch })).toBeVisible();
  });

  it("shows a refusal's own sentence", async () => {
    renderPage("refused");
    expect(await screen.findByText(messages.errors.reasons.MISSING_PERMISSION)).toBeVisible();
  });

  it("needs leads:create and settings:manage", async () => {
    stubApi({ "websiteForm.get": { data: aWebsiteFormView() } });
    renderScreen(<WebsiteFormPage />, { me: salesperson, width: "wide" });
    expect(await screen.findByText(messages.shell.session.noAccess)).toBeVisible();
  });
});
