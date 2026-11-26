// A quote's actions in one row: WhatsApp, Live link with Copy, the PDF, Edit, Mark accepted (green), Mark declined and
// Delete (red), and the "⋯" menu; Edit on a draft is the form, on a sent quote a new version; no writing for the customer.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { QuoteActions } from "@/quotes/quote-actions";
import { inputsTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aQuote } from "./quote";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const words = messages.quotes.quote;
const editor = member({ permissions: ["quotes:view", "quotes:create", "quotes:edit"] });
const row = () => screen.getByRole("group", { name: words.actionsLabel });
const names = () =>
  [...row().querySelectorAll("button, a")].map((one) => one.getAttribute("aria-label") ?? one.textContent);

beforeEach(() => {
  push.mockReset();
});

describe("a quote's actions", () => {
  it("holds, in order, WhatsApp, the live link, the PDF, Edit, Mark accepted, Mark declined, Delete and More", async () => {
    stubApi({ "quotes.share": { data: { path: "/p/token-1" } } });
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    expect(names()).toEqual([
      words.sendWhatsapp,
      words.liveLink,
      words.pdf,
      words.edit,
      words.markAccepted,
      words.markDeclined,
      words.delete,
      words.more,
    ]);
    await userEvent.click(screen.getByRole("button", { name: words.liveLink }));
    const link = await screen.findByRole("link", { name: words.liveLink });
    expect(link).toHaveAttribute("href", "/p/token-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: words.copyLink })).toBeTruthy();
    expect(names()).toEqual([
      words.sendWhatsapp,
      words.liveLink,
      words.copyLink,
      words.pdf,
      words.edit,
      words.markAccepted,
      words.markDeclined,
      words.delete,
      words.more,
    ]);
  });

  it("makes Mark accepted green and Mark declined and Delete red", () => {
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    expect(screen.getByRole("button", { name: words.markAccepted })).toHaveAttribute("data-variant", "success");
    expect(screen.getByRole("button", { name: words.markDeclined })).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByRole("button", { name: words.delete })).toHaveAttribute("data-variant", "destructive");
  });

  it("edits a draft in its form, with no new version", () => {
    renderScreen(<QuoteActions quote={aQuote({ status: "draft" })} />, { me: editor, width: "wide" });
    expect(screen.getByRole("link", { name: words.edit })).toHaveAttribute("href", "#quote-form");
    expect(screen.queryByRole("button", { name: words.markAccepted })).toBeNull();
  });

  it("makes a new version of a sent quote and opens that draft", async () => {
    const draft = aQuote({ id: "0199a000-0000-7000-8000-0000000000a2", status: "draft" });
    stubApi({ "quotes.newVersion": { data: draft } });
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.edit }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/quotes/${draft.id}`);
    });
    expect(inputsTo("quotes.newVersion")).toEqual([{ quoteId: aQuote().id }]);
  });

  it("holds Duplicate as another option and Save as package in the more menu", async () => {
    const copy = aQuote({ id: "0199a000-0000-7000-8000-0000000000a3", status: "draft" });
    stubApi({ "quotes.duplicate": { data: copy } });
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.more }));
    expect(await screen.findByRole("menuitem", { name: words.duplicateOption })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: words.duplicateOption }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/quotes/${copy.id}`);
    });
    await userEvent.click(screen.getByRole("button", { name: words.more }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.quotes.package.save }));
    expect(await screen.findByRole("dialog", { name: messages.quotes.package.title })).toBeTruthy();
  });

  it("asks before it deletes", async () => {
    stubApi({ "quotes.delete": { data: null } });
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: words.delete }));
    const dialog = await screen.findByRole("alertdialog", { name: words.deleteTitle });
    await userEvent.click(within(dialog).getByRole("button", { name: words.delete }));
    await waitFor(() => {
      expect(inputsTo("quotes.delete")).toEqual([{ quoteId: aQuote().id }]);
    });
  });

  it("never offers to write for the customer", () => {
    renderScreen(<QuoteActions quote={aQuote()} />, { me: editor, width: "wide" });
    expect(screen.queryByText(/write for the customer/i)).toBeNull();
  });

  it("gives a member without quotes:edit the PDF alone", () => {
    renderScreen(<QuoteActions quote={aQuote()} />, { me: member({ permissions: ["quotes:view"] }), width: "wide" });
    expect(names()).toEqual([words.pdf]);
  });
});
