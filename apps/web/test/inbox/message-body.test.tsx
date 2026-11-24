// What a bubble says about a message that was edited, deleted for everyone, not shared by WhatsApp, an album, or came from an ad.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { cleanup, screen } from "@testing-library/react";
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
});
