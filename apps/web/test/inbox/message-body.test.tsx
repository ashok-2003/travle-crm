// What a bubble says about a message that was edited, deleted for everyone, not shared by WhatsApp, an album, or came from an ad.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "@/inbox/message-bubble";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aMessage, answerApi } from "./answer-api";

const show = (fields: Record<string, unknown>) => {
  answerApi({});
  renderWithApi(
    <MessageBubble message={aMessage(fields) as ChatMessage} senderName={null} quotedSender="Rahul" first showSender />,
    newQueryClient(),
  );
};

describe("a bubble's account of what happened to the message", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an edited message's text with Edited", () => {
    show({ body: "Five nights", editedAt: "2026-10-26T10:05:00.000Z" });
    expect(screen.getByText("Five nights")).toBeTruthy();
    expect(screen.getAllByText(/^Edited/).length).toBeGreaterThan(0);
  });

  it("keeps a customer's deleted message struck through, saying who deleted it before the words", () => {
    show({ body: "Five nights", revokedAt: "2026-10-26T10:05:00.000Z" });
    const words = screen.getByText("Five nights");
    expect(words.closest(".line-through")).not.toBeNull();
    const label = screen.getAllByText(/^Deleted by the customer/)[0];
    expect(label?.compareDocumentPosition(words)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("says a message we sent from the phone was deleted from the phone", () => {
    show({
      direction: "out",
      origin: "staff_phone",
      status: "sent",
      body: "Hello",
      revokedAt: "2026-10-26T10:05:00.000Z",
    });
    expect(screen.getAllByText(/^Deleted from the phone/).length).toBeGreaterThan(0);
  });

  it("reads Deleted from the phone for any outbound message, sent from the CRM or by the AI", () => {
    show({
      direction: "out",
      origin: "staff_crm",
      status: "sent",
      body: "Hello",
      revokedAt: "2026-10-26T10:05:00.000Z",
    });
    expect(screen.getAllByText(/^Deleted from the phone/).length).toBeGreaterThan(0);
    cleanup();
    show({
      direction: "out",
      origin: "automation",
      byAi: true,
      status: "sent",
      body: "Hi",
      revokedAt: "2026-10-26T10:05:00.000Z",
    });
    expect(screen.getAllByText(/^Deleted from the phone/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Deleted by the customer/)).toBeNull();
  });

  it("explains a message WhatsApp did not share", () => {
    show({ kind: "unsupported", body: null, unsupportedReason: "unavailable" });
    expect(screen.getByText("WhatsApp didn't share this message: read it on the phone")).toBeTruthy();
  });

  it("names an album", () => {
    show({ kind: "unsupported", body: null, unsupportedReason: "album" });
    expect(screen.getByText("Sent an album of photos")).toBeTruthy();
  });

  it("keeps today's line for an unknown unsupported message", () => {
    show({ kind: "unsupported", body: null, unsupportedReason: "unknown" });
    expect(screen.getByText("This message type can't be shown here. Open it on the phone.")).toBeTruthy();
  });

  it("shows an ad click's text and the ad's headline", () => {
    show({ body: "Is this trip open?", adHeadline: "Spiti in June" });
    expect(screen.getByText("Is this trip open?")).toBeTruthy();
    expect(screen.getByText("From your ad: Spiti in June")).toBeTruthy();
  });

  describe("the corner's invisible spacer sits on the words' last line", () => {
    const BLOCK = "p, li, blockquote, div, pre, ul, ol";
    const cases: [string, Record<string, unknown>, string, boolean][] = [
      ["a one-line text", { body: "Five nights" }, "Five nights", true],
      ["a two-paragraph text", { body: "First part\n\nSecond part" }, "Second part", true],
      ["a text ending in a bullet list", { body: "Includes:\n- meals\n- transport" }, "transport", false],
      ["a quote", { body: "> as you said" }, "as you said", false],
      ["a deleted text", { body: "Five nights", revokedAt: "2026-10-26T10:05:00.000Z" }, "Five nights", true],
      ["an ad text", { body: "Is this trip open?", adHeadline: "Spiti in June" }, "From your ad: Spiti in June", true],
    ];
    it.each(cases)("for %s", (_name, fields, lastWords, inlineOnly) => {
      show(fields);
      const last = screen.getByText(lastWords);
      const spacer = document.querySelector("[aria-hidden=true].invisible");
      expect(spacer).not.toBeNull();
      const home = last.closest(BLOCK);
      expect(home).not.toBeNull();
      expect(spacer?.parentElement?.closest(BLOCK)).toBe(home);
      // The spacer comes after the last words, never before them.
      expect(last.compareDocumentPosition(spacer as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Only paragraphs: one inline run, with no block box of its own inside the bubble's line.
      if (inlineOnly) expect(home?.getAttribute("dir")).toBe("auto");
    });
  });

  it("offers Forward on a message but not on one deleted for everyone", async () => {
    show({ body: "Five nights" });
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    expect(screen.getByRole("menuitem", { name: /Forward/ })).toBeTruthy();
    cleanup();
    show({ body: "Five nights", revokedAt: "2026-10-26T10:05:00.000Z" });
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    expect(screen.getByRole("menuitem", { name: /Reply/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Star/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Forward/ })).toBeNull();
  });

  it("reads a message from an older api, which leaves out the four new fields, as untouched", async () => {
    const full = aMessage({ body: "Five nights" });
    const older = Object.fromEntries(
      Object.entries(full).filter(
        ([key]) => !["revokedAt", "editedAt", "adHeadline", "unsupportedReason"].includes(key),
      ),
    );
    answerApi({});
    renderWithApi(
      <MessageBubble
        message={older as unknown as ChatMessage}
        senderName={null}
        quotedSender="Rahul"
        first
        showSender
      />,
      newQueryClient(),
    );
    expect(screen.getByText("Five nights").closest(".line-through")).toBeNull();
    expect(screen.queryByText(/Deleted/)).toBeNull();
    expect(screen.queryByText(/Edited/)).toBeNull();
    expect(screen.queryByText(/From your ad/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More for this message" }));
    expect(screen.getByRole("menuitem", { name: /Forward/ })).toBeTruthy();
  });
});
