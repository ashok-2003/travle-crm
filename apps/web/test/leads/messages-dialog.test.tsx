// Messages on a lead's page (release 5, scope 3.5): the agency's one library with this customer's blanks filled in by the
// api; a blank with nothing to fill is highlighted; Copy makes the message ready (the quote's link is made then) and
// copies it; Open in WhatsApp needs inbox:reply.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MessagesButton } from "@/leads/lead/messages-dialog";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { ids } from "./records";
import { inputsTo, owner, renderScreen } from "./screen";

const words = messages.leads.lead.messages;
const library = [
  {
    id: "0199e7a0-0000-7000-8000-0000000003a1",
    shortcut: "quote",
    title: "Send the quote",
    body: "Hi {name}, pay {amount}: {link}",
  },
  { id: "0199e7a0-0000-7000-8000-0000000003a2", shortcut: "hello", title: "Say hello", body: "Hello {name}" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

let preview = { text: "Hi Rahul, pay ₹5,000: {link}", open: [] as string[] };

function open(me = owner) {
  const api = stubApi({
    "leads.messageLibrary": { data: library },
    "leads.messagePreview": { data: preview },
    "leads.readyMessage": { data: { text: "Hi Rahul, pay ₹5,000: https://app.test/p/abc", open: [] } },
  });
  renderScreen(<MessagesButton leadId={ids.rahul} name="Rahul Sharma" phone="+919876543210" />, { me });
  return api;
}

describe("Messages", () => {
  beforeEach(() => {
    preview = { text: "Hi Rahul, pay ₹5,000: {link}", open: [] };
  });

  it("lists the library, previews the chosen message with the blank that has no value highlighted", async () => {
    preview = { text: "Hi Rahul, pay {amount}: {link}", open: ["amount"] };
    open();
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("radio", { name: "Send the quote" }));
    await waitFor(() => {
      expect(inputsTo("leads.messagePreview")).toContainEqual({ leadId: ids.rahul, text: library[0]?.body });
    });
    const blank = await within(dialog).findByText("{amount}");
    expect(blank).toHaveClass("bg-status-attention-fill");
    expect(within(dialog).getByText(words.linkNote)).toBeVisible();
  });

  it("makes the message ready, with the quote's link, when it is copied", async () => {
    const written = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: written } });
    open();
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: words.copy })).toBeDisabled();
    await userEvent.click(await within(dialog).findByRole("radio", { name: "Send the quote" }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.copy }));
    await waitFor(() => {
      expect(inputsTo("leads.readyMessage")).toEqual([{ leadId: ids.rahul, text: library[0]?.body }]);
    });
    await waitFor(() => {
      expect(written).toHaveBeenCalledWith("Hi Rahul, pay ₹5,000: https://app.test/p/abc");
    });
  });

  it("offers Open in WhatsApp only to someone who may reply in the inbox", async () => {
    open(member({ permissions: ["leads:view"] }));
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: words.whatsApp })).toBeNull();
  });

  it("will not copy or open a message while a blank has no value for this lead, and says why", async () => {
    preview = { text: "Hi Rahul, pay {amount}: {link}", open: ["amount"] };
    open();
    await userEvent.click(screen.getByRole("button", { name: words.button }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("radio", { name: "Send the quote" }));
    const copy = within(dialog).getByRole("button", { name: words.copy });
    await waitFor(() => {
      expect(copy).toBeDisabled();
    });
    expect(copy).toHaveAccessibleDescription(/nothing for \{amount\} yet/);
    expect(inputsTo("leads.readyMessage")).toEqual([]);
  });
});
