// The reply box is one row (spec item 11): no Reply / Note toggle; a team note is chosen from the tools ("+" on a phone, the
// tools row on a computer), turns the box into a note with a way back, and each box keeps its own words meanwhile.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ReplyArea } from "@/inbox/reply-area";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const header = (withLead: boolean, over: Partial<ConversationHeader> = {}): ConversationHeader =>
  ({
    id: "01900000-0000-7000-8000-00000000000a",
    phone: "+919876543210",
    name: "Rahul Mehta",
    personId: null,
    lead: withLead ? { id: "01900000-0000-7000-8000-0000000000bb", stage: "new", ownerUserId: null } : null,
    pastCustomer: false,
    liveLead: null,
    windowOpenUntil: "2099-01-01T00:00:00.000Z",
    lastInboundAt: "2026-10-26T10:00:00.000Z",
    needsReply: false,
    trip: { destination: null, travelMonth: null },
    optedOut: false,
    agreed: true,
    state: "open",
    tags: [],
    pinned: false,
    archived: false,
    snoozedUntil: null,
    replying: [],
    number: { id: "01900000-0000-7000-8000-0000000000aa", label: "WhatsApp", status: "connected" },
    otherChats: [],
    ...over,
  }) as ConversationHeader;

const render = (withLead: boolean, over: Partial<ConversationHeader> = {}) =>
  renderWithApi(<ReplyArea header={header(withLead, over)} />, newQueryClient());

describe("the one-row reply box", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    fakeApi();
  });

  for (const screen_ of ["wide", "phone"] as const) {
    const openNote = async () => {
      if (screen_ === "phone") await userEvent.click(screen.getByRole("button", { name: "Message tools" }));
      await userEvent.click(screen.getByRole("button", { name: "Note" }));
    };

    describe(`on a ${screen_} screen`, () => {
      beforeEach(() => {
        screenIs(screen_);
      });

      it("has no Reply / Note toggle", () => {
        render(true);
        expect(screen.queryByRole("radio", { name: "Note" })).toBeNull();
        expect(screen.queryByRole("radio", { name: "Reply" })).toBeNull();
        expect(screen.getByRole("combobox", { name: "Message" })).toBeInTheDocument();
      });

      it("turns the box into a note from the tools, and back with its draft intact", async () => {
        render(true);
        await userEvent.type(screen.getByRole("combobox", { name: "Message" }), "Hello Rahul");
        await openNote();
        expect(screen.queryByRole("combobox", { name: "Message" })).toBeNull();
        await userEvent.type(screen.getByRole("combobox", { name: "A note for your team" }), "Call him");
        expect(screen.getByText("Only your team sees this")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Back to replying" }));
        expect(screen.getByRole("combobox", { name: "Message" })).toHaveValue("Hello Rahul");
        await openNote();
        expect(screen.getByRole("combobox", { name: "A note for your team" })).toHaveValue("Call him");
      });

      it("offers Note disabled, with the reason, when the chat has no lead", async () => {
        render(false);
        if (screen_ === "phone") await userEvent.click(screen.getByRole("button", { name: "Message tools" }));
        const note = screen.getByRole("button", { name: "Note" });
        expect(note).toBeDisabled();
        expect(note).toHaveAccessibleDescription("This chat has no lead yet, so there is nothing to attach a note to.");
        expect(screen.queryByText(/nothing to attach a note to/, { selector: "p" })).toBeNull();
      });

      it("keeps the round button at the right of the box: the mic while it is empty, Send once there is text", async () => {
        render(true);
        const field = screen.getByRole("combobox", { name: "Message" });
        const mic = screen.queryByRole("button", { name: "Record a voice note" });
        if (mic !== null) expect(field.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        else expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
        await userEvent.type(field, "Hi");
        const send = screen.getByRole("button", { name: "Send" });
        expect(field.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(send.closest("[data-slot=input-group]")).toBeNull();
        expect(screen.queryByRole("button", { name: "Record a voice note" })).toBeNull();
      });

      it("writes a note where the window is closed, and where the person opted out, and goes back", async () => {
        for (const over of [{ windowOpenUntil: null }, { windowOpenUntil: null, optedOut: true }]) {
          const view = render(true, over);
          await userEvent.click(screen.getByRole("button", { name: "Note" }));
          expect(screen.getByRole("combobox", { name: "A note for your team" })).toBeInTheDocument();
          await userEvent.click(screen.getByRole("button", { name: "Back to replying" }));
          expect(screen.queryByRole("combobox", { name: "A note for your team" })).toBeNull();
          view.unmount();
        }
      });

      it("describes the disabled Note by the no-lead sentence where the window is closed", () => {
        render(false, { windowOpenUntil: null });
        expect(screen.getByRole("button", { name: "Note" })).toHaveAccessibleDescription(
          "This chat has no lead yet, so there is nothing to attach a note to.",
        );
      });

      it("returns the focus to the Note button where there is no reply box", async () => {
        render(true, { windowOpenUntil: null });
        await userEvent.click(screen.getByRole("button", { name: "Note" }));
        await userEvent.click(screen.getByRole("button", { name: "Back to replying" }));
        await waitFor(() => {
          expect(screen.getByRole("button", { name: "Note" })).toHaveFocus();
        });
      });

      it("moves the focus into the note, and back to the message box", async () => {
        render(true);
        await openNote();
        await waitFor(() => {
          expect(screen.getByRole("combobox", { name: "A note for your team" })).toHaveFocus();
        });
        await userEvent.click(screen.getByRole("button", { name: "Back to replying" }));
        await waitFor(() => {
          expect(screen.getByRole("combobox", { name: "Message" })).toHaveFocus();
        });
      });
    });
  }
});
