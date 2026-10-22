// Preview (spec 3.4): the visitors' own form, with the settings on the page whether saved or not, in a phone-wide or
// computer-wide frame, with Send off and the line that nothing is sent.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { lastInputTo, renderScreen } from "../../leads/screen";
import { stubApi } from "../../support/api-stub";
import { publicFormOf } from "../../website-form/support";
import { aWebsiteFormView } from "./records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const t = messages.websiteFormSettings;

function render(
  preview: unknown = { data: publicFormOf({ heading: "Come to Goa" }) },
  width: "phone" | "wide" = "wide",
) {
  const api = stubApi({
    "websiteForm.get": { data: aWebsiteFormView() },
    "websiteForm.counts": { data: { enquiries: 0, newLeads: 0, repeatEnquiries: 0, stopped: 0 } },
    "websiteForm.preview": preview as never,
    "organization.logo.get": { data: null },
    "organization.branding.get": { data: null },
  });
  renderScreen(<WebsiteFormScreen />, { width });
  return api;
}

async function openPreview() {
  await userEvent.click(await screen.findByRole("button", { name: t.preview.button }));
  return screen.findByRole("dialog", { name: t.preview.title });
}

describe("Preview", () => {
  it("shows the form built from the unsaved settings", async () => {
    render();
    await userEvent.type(await screen.findByLabelText(t.words.formHeading), "Come to Goa");
    const dialog = await openPreview();
    expect(await within(dialog).findByRole("heading", { name: "Come to Goa" })).toBeVisible();
    expect(lastInputTo("websiteForm.preview")).toMatchObject({ heading: "Come to Goa", emailMode: "optional" });
  });

  it("sets the frame to 390 pixels for a phone and 960 for a computer", async () => {
    render();
    const dialog = await openPreview();
    const frame = async () =>
      (await within(dialog).findByRole("form")).closest<HTMLElement>("[data-slot=website-form]");
    expect(await frame()).toHaveStyle({ width: "960px" });
    await userEvent.click(within(dialog).getByRole("radio", { name: t.preview.phone }));
    expect(await frame()).toHaveStyle({ width: "390px" });
    await userEvent.click(within(dialog).getByRole("radio", { name: t.preview.computer }));
    expect(await frame()).toHaveStyle({ width: "960px" });
  });

  it("fills the form with sample answers, has Send off and says nothing is sent", async () => {
    render();
    const dialog = await openPreview();
    expect(await within(dialog).findByLabelText(messages.websiteForm.form.name)).toHaveValue("Asha Rao");
    expect(await within(dialog).findByRole("button", { name: messages.websiteForm.form.send })).toBeDisabled();
    expect(within(dialog).getByText(messages.websiteForm.form.previewNote)).toBeVisible();
  });

  it("asks for the answers to be fixed instead of previewing a link that isn't https", async () => {
    const api = render();
    await userEvent.type(await screen.findByLabelText(t.words.websiteUrl), "http://sharma.example");
    const dialog = await openPreview();
    expect(within(dialog).getByText(t.preview.fix)).toBeVisible();
    expect(api.calls).not.toContain("websiteForm.preview");
  });

  it("says when the preview did not load", async () => {
    render({ status: 500 });
    const dialog = await openPreview();
    expect(await within(dialog).findByText(t.preview.loadFailed)).toBeVisible();
  });

  it("returns the focus to Preview when it closes", async () => {
    render();
    const button = await screen.findByRole("button", { name: t.preview.button });
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: t.preview.title });
    await userEvent.click(within(dialog).getByRole("button", { name: t.preview.done }));
    await waitFor(() => {
      expect(button).toHaveFocus();
    });
  });

  it("opens on the phone-wide frame on a phone", async () => {
    render(undefined, "phone");
    const dialog = await openPreview();
    const form = await within(dialog).findByRole("form");
    expect(form.closest("[data-slot=website-form]")).toHaveStyle({ width: "390px" });
  });

  it("never sends the page's Save when the preview's own form is submitted", async () => {
    const api = render();
    const dialog = await openPreview();
    fireEvent.submit(await within(dialog).findByRole("form"));
    expect(api.calls).not.toContain("websiteForm.save");
  });
});
