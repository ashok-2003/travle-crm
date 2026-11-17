// The next move on a follow-up: what to do about it, read from the lead's WhatsApp chat and what the AI did last.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { nextMove, replied } from "@/follow-ups/next-move";

const chat = (lastFrom: NonNullable<FollowUpRow["whatsapp"]>["lastFrom"], windowOpen: boolean) => ({
  conversationId: "0198c1a0-0000-7000-8000-000000000001",
  lastAt: "2026-11-18T05:00:00.000Z",
  lastFrom,
  lastText: "Hello",
  windowOpen,
});
const ai = (outcome: NonNullable<FollowUpRow["ai"]>["outcome"]) => ({
  at: "2026-11-18T04:00:00.000Z",
  outcome,
  text: null,
});
const row = (parts: Pick<Partial<FollowUpRow>, "whatsapp" | "ai">): FollowUpRow => ({
  taskId: "0198c1a0-0000-7000-8000-000000000002",
  title: "Call",
  dueAt: "2026-11-18T06:00:00.000Z",
  assigneeUserId: null,
  byAi: false,
  lead: { id: "0198c1a0-0000-7000-8000-000000000003", name: "Asha", stage: "contacted", phone: null },
  whatsapp: null,
  ai: null,
  ...parts,
});

describe("nextMove", () => {
  it("answers on WhatsApp when the customer wrote last and the window is open", () => {
    expect(nextMove(row({ whatsapp: chat("customer", true) }))).toBe("answer-whatsapp");
  });

  it("says the customer replied but the window closed", () => {
    expect(nextMove(row({ whatsapp: chat("customer", false) }))).toBe("replied-window-closed");
  });

  it("calls when the AI wrote and nothing came back", () => {
    expect(nextMove(row({ whatsapp: chat("ai", true), ai: ai("sent") }))).toBe("call");
  });

  it.each(["window_closed", "no_chat", "opted_out", "failed"] as const)(
    "calls or sends a template after %s",
    (outcome) => {
      expect(nextMove(row({ ai: ai(outcome) }))).toBe("call-or-template");
    },
  );

  it("calls or sends a template when there is no chat to write in", () => {
    expect(nextMove(row({ ai: ai("no_chat"), whatsapp: null }))).toBe("call-or-template");
  });

  it("has nothing to say when nothing has happened yet", () => {
    expect(nextMove(row({}))).toBeNull();
  });
});

describe("replied", () => {
  it("is true only when the customer wrote last", () => {
    expect(replied(row({ whatsapp: chat("customer", true) }))).toBe(true);
    expect(replied(row({ whatsapp: chat("team", true) }))).toBe(false);
    expect(replied(row({ whatsapp: chat("ai", true) }))).toBe(false);
    expect(replied(row({}))).toBe(false);
  });
});
