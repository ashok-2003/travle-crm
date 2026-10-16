// The branding form (spec 9.3): the brand colour, typed or picked, with its swatch, and the terms every document
// prints, saved through organization.branding.update. A colour that isn't #rrggbb is caught before sending; before the
// business details exist the screen sends the Owner to them first; a newer branding from another tab keeps what is
// being typed; in a read-only organization saving is disabled with the reason.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandingForm } from "@/branding/branding-form";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { inputsSentTo } from "../documents/sent";
import { subscriptionAnswer } from "../documents/subscription";

const words = messages.documents.branding.details;

const saved = { brandColour: "#1f6f5c", documentTerms: "50% to book.", updatedAt: "2026-10-15T05:30:00.000Z" };

function renderForm(answers: Record<string, Answer> = {}) {
  const api = stubApi({
    "organization.branding.get": { data: saved },
    "subscription.get": subscriptionAnswer(),
    ...answers,
  });
  const queryClient = newQueryClient(null);
  renderWithApi(<BrandingForm />, queryClient);
  return { ...api, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrandingForm", () => {
  it("shows the colour, with its swatch, and the terms as saved", async () => {
    renderForm();
    expect(await screen.findByLabelText(words.colour)).toHaveValue("#1f6f5c");
    expect(screen.getByLabelText(words.colourPicker)).toHaveValue("#1f6f5c");
    expect(screen.getByLabelText(words.terms)).toHaveValue("50% to book.");
  });

  it("saves a picked colour and new terms, and shows what the api saved", async () => {
    const user = userEvent.setup();
    const api = renderForm({
      "organization.branding.update": {
        data: { brandColour: "#6a4bbd", documentTerms: "Pay within 7 days.", updatedAt: saved.updatedAt },
      },
    });
    const colour = await screen.findByLabelText(words.colour);
    await user.clear(colour);
    await user.type(colour, "#6A4BBD");
    const terms = screen.getByLabelText(words.terms);
    await user.clear(terms);
    await user.type(terms, "Pay within 7 days.");
    await user.click(screen.getByRole("button", { name: words.save }));

    await waitFor(() => {
      expect(api.calls).toContain("organization.branding.update");
    });
    expect(inputsSentTo("organization.branding.update")).toEqual([
      { brandColour: "#6A4BBD", documentTerms: "Pay within 7 days." },
    ]);
    await waitFor(() => {
      expect(screen.getByLabelText(words.colour)).toHaveValue("#6a4bbd");
    });
  });

  it("follows the colour picker in the typed colour", async () => {
    renderForm();
    const picker = await screen.findByLabelText(words.colourPicker);
    // A colour input can't be typed into; the picker hands its value over as an input event.
    fireEvent.input(picker, { target: { value: "#034f46" } });
    expect(screen.getByLabelText(words.colour)).toHaveValue("#034f46");
  });

  it("sends an empty colour as none, for the standard one", async () => {
    const user = userEvent.setup();
    renderForm({ "organization.branding.update": { data: { ...saved, brandColour: null } } });
    await user.clear(await screen.findByLabelText(words.colour));
    await user.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(inputsSentTo("organization.branding.update")).toEqual([
        { brandColour: "", documentTerms: "50% to book." },
      ]);
    });
  });

  it("refuses a colour that isn't #rrggbb before sending it", async () => {
    const user = userEvent.setup();
    const api = renderForm();
    const colour = await screen.findByLabelText(words.colour);
    await user.clear(colour);
    await user.type(colour, "green");
    await user.click(screen.getByRole("button", { name: words.save }));
    expect(await screen.findByText(words.colourInvalid)).toBeVisible();
    expect(colour).toHaveAttribute("aria-invalid", "true");
    expect(api.calls).not.toContain("organization.branding.update");
  });

  it("shows a refusal as its sentence", async () => {
    const user = userEvent.setup();
    renderForm({ "organization.branding.update": { status: 409, reason: "PROFILE_NOT_SAVED" } });
    await user.click(await screen.findByRole("button", { name: words.save }));
    expect(await screen.findByText(messages.errors.reasons.PROFILE_NOT_SAVED)).toBeVisible();
  });

  it("sends the Owner to the business details first, when there are none", async () => {
    renderForm({ "organization.branding.get": { data: null } });
    expect(await screen.findByText(messages.documents.branding.profileFirst)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.documents.branding.profileLink })).toHaveAttribute(
      "href",
      routes.profile,
    );
    expect(screen.queryByLabelText(words.colour)).toBeNull();
  });

  it("says when the branding didn't load, and tries again", async () => {
    const user = userEvent.setup();
    const api = renderForm({ "organization.branding.get": { status: 500 } });
    await user.click(await screen.findByRole("button", { name: messages.common.tryAgain }));
    expect(api.calls.filter((path) => path === "organization.branding.get").length).toBeGreaterThan(1);
  });

  it("keeps what is being typed when a newer branding arrives from another tab", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderForm();
    const terms = await screen.findByLabelText(words.terms);
    await user.clear(terms);
    await user.type(terms, "Pay within 7 days.");
    const [query] = queryClient.getQueryCache().findAll({
      predicate: (each) => JSON.stringify(each.queryKey).includes("branding"),
    });
    act(() => {
      queryClient.setQueryData(query?.queryKey ?? [], { ...saved, brandColour: "#6a4bbd" });
    });
    await waitFor(() => {
      expect(screen.getByLabelText(words.colour)).toHaveValue("#6a4bbd");
    });
    expect(screen.getByLabelText(words.terms)).toHaveValue("Pay within 7 days.");
  });

  it("disables saving in a read-only organization, saying why", async () => {
    renderForm({
      "subscription.get": subscriptionAnswer("read_only"),
    });
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: words.save })).toBeDisabled();
  });
});
