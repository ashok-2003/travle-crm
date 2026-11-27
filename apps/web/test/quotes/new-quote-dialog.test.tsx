// New quote from the list: while the blank quote is being made the dialog ignores a close, and when it is made the screen
// opens it, so a quote is never made without the person arriving at it.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { NewQuoteDialog } from "@/quotes/new-quote-dialog";
import { NewQuoteMenu } from "@/quotes/new-quote-menu";
import { heldAnswer, stubApi } from "../support/api-stub";
import { address } from "../leads/navigation";
import { aLead, aListItem, aPage } from "../leads/records";
import { renderScreen } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const quoteId = "0199a000-0000-7000-8000-0000000000a1";

describe("NewQuoteMenu", () => {
  it("says it is no longer pending when it goes away mid-make", async () => {
    const held = heldAnswer({ data: { id: quoteId } });
    stubApi({
      "quotes.packages": { data: [] },
      "quotes.settings": { data: { defaultTaxRateBasisPoints: 500 } },
      "quotes.create": held.answer,
    });
    const onPending = vi.fn();
    const { unmount } = renderScreen(<NewQuoteMenu lead={aLead()} onPending={onPending} />, { width: "wide" });
    await userEvent.click(await screen.findByRole("button", { name: messages.quotes.lead.new }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.quotes.lead.blank }));
    await waitFor(() => {
      expect(onPending).toHaveBeenLastCalledWith(true);
    });
    unmount();
    expect(onPending).toHaveBeenLastCalledWith(false);
    held.release();
  });
});

describe("NewQuoteDialog", () => {
  const open = (width: "wide" | "phone" = "wide") =>
    renderScreen(<NewQuoteDialog open onOpenChange={vi.fn()} returnFocusTo={{ current: null }} />, { width });

  it("is a centred dialog, not a bottom sheet, on a phone", async () => {
    stubApi({ "leads.list": aPage([aListItem()]) });
    open("phone");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it("lists the newest leads before anything is typed, with no dropdown", async () => {
    const inputs: unknown[] = [];
    stubApi({
      "leads.list": (input) => {
        inputs.push(input);
        return aPage([aListItem()]);
      },
    });
    open();
    expect(await screen.findByText("Rahul Sharma", { selector: "span" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=popover-content]")).toBeNull();
    expect(inputs[0]).toMatchObject({ limit: 8 });
    expect(inputs[0]).not.toHaveProperty("search");
  });

  it("asks leads.list with what is typed", async () => {
    const inputs: unknown[] = [];
    stubApi({
      "leads.list": (input) => {
        inputs.push(input);
        return aPage([aListItem()]);
      },
    });
    open();
    await userEvent.type(await screen.findByPlaceholderText(messages.quotes.list.newQuote.search), "Rah");
    await waitFor(() => {
      expect(inputs.some((input) => (input as { search?: string }).search === "Rah")).toBe(true);
    });
  });

  it("shows the chosen lead with Change and the quote choices, and Change goes back to the list", async () => {
    stubApi({
      "leads.list": aPage([aListItem()]),
      "leads.get": { data: aLead() },
      "quotes.packages": { data: [] },
      "quotes.settings": { data: { defaultTaxRateBasisPoints: 500 } },
    });
    open();
    await userEvent.click(await screen.findByText("Rahul Sharma", { selector: "span" }));
    expect(await screen.findByRole("button", { name: messages.quotes.lead.new })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: messages.quotes.list.newQuote.change }));
    expect(await screen.findByText("Rahul Sharma", { selector: "span" })).toBeInTheDocument();
  });

  it("holds itself open while the quote is made, then opens the quote", async () => {
    address.set("/quotes");
    const held = heldAnswer({ data: { id: quoteId } });
    stubApi({
      "leads.list": aPage([aListItem()]),
      "leads.get": { data: aLead() },
      "quotes.packages": { data: [] },
      "quotes.settings": { data: { defaultTaxRateBasisPoints: 500 } },
      "quotes.create": held.answer,
    });
    const onOpenChange = vi.fn();
    renderScreen(<NewQuoteDialog open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />, {
      width: "wide",
    });
    await userEvent.click(await screen.findByText("Rahul Sharma", { selector: "span" }));
    await userEvent.click(await screen.findByRole("button", { name: messages.quotes.lead.new }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.quotes.lead.blank }));
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: messages.quotes.list.newQuote.change })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(address.href).toContain(quoteId);
    });
  });
});
