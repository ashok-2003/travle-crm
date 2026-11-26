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
    await userEvent.click(await screen.findByRole("combobox"));
    await userEvent.type(await screen.findByPlaceholderText("Search by name or phone"), "Ra");
    await userEvent.click(await screen.findByText("Rahul Sharma", { selector: "span" }));
    await userEvent.click(await screen.findByRole("button", { name: messages.quotes.lead.new }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.quotes.lead.blank }));
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The lead can't change under the quote being made.
    expect(screen.getByRole("combobox")).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(address.href).toContain(quoteId);
    });
  });
});
