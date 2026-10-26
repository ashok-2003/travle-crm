// "Priya is replying" (sales inbox spec 6, owner decision 5 of 2026-10-26): kept in memory per organization and chat, gone
// after its lifetime, swept so the map can't grow, and the lifetime outlasts the header's poll so a mark is seen.
import { INBOX_POLL_MS } from "@travel-crm/contracts/inbox";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTyping,
  markTyping,
  presenceSize,
  resetPresence,
  TYPING_LIFETIME_MS,
  typingIn,
} from "../src/inbox-presence.js";

const org = "0199e7a0-0000-7000-8000-0000000000a1";
const otherOrg = "0199e7a0-0000-7000-8000-0000000000a2";
const chat = "0199e7a0-0000-7000-8000-0000000000b1";
const priya = "0199e7a0-0000-7000-8000-0000000000c1";
const ravi = "0199e7a0-0000-7000-8000-0000000000c2";

describe("who is replying in a chat", () => {
  beforeEach(resetPresence);

  it("shows the others, never the one asking", () => {
    markTyping(org, chat, priya, 1_000);
    markTyping(org, chat, ravi, 1_000);
    expect(typingIn(org, chat, priya, 2_000)).toEqual([ravi]);
  });

  it("keeps an organization's chat apart from another organization's", () => {
    markTyping(org, chat, priya, 1_000);
    expect(typingIn(otherOrg, chat, ravi, 2_000)).toEqual([]);
  });

  it("forgets a mark after its lifetime, and that lifetime outlasts the poll that reads it", () => {
    expect(TYPING_LIFETIME_MS).toBeGreaterThan(INBOX_POLL_MS);
    markTyping(org, chat, priya, 1_000);
    expect(typingIn(org, chat, ravi, 1_000 + INBOX_POLL_MS)).toEqual([priya]);
    expect(typingIn(org, chat, ravi, 1_000 + TYPING_LIFETIME_MS)).toEqual([]);
  });

  it("sweeps expired marks of chats nobody asks about, so the map does not grow", () => {
    for (let index = 0; index < 50; index += 1) markTyping(org, `chat-${String(index)}`, priya, 1_000);
    expect(presenceSize()).toBe(50);
    markTyping(org, chat, ravi, 1_000 + TYPING_LIFETIME_MS + 1);
    expect(presenceSize()).toBe(1);
  });

  it("drops a member's mark when they send, and clears nothing of anyone else's", () => {
    markTyping(org, chat, priya, 1_000);
    markTyping(org, chat, ravi, 1_000);
    clearTyping(org, chat, priya);
    expect(typingIn(org, chat, "0199e7a0-0000-7000-8000-0000000000c9", 2_000)).toEqual([ravi]);
  });

  it("stops taking new marks past a ceiling, rather than growing without bound", () => {
    for (let index = 0; index < 6_000; index += 1) markTyping(org, `chat-${String(index)}`, priya, 1_000);
    expect(presenceSize()).toBeLessThanOrEqual(5_000);
  });
});
