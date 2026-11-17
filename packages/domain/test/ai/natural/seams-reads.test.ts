// The seams natural opens for a second agent in its reads and its refusal: an earlier assistant's words kept whole only
// when asked, and the act that follows a refused booking.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { naturalChatLines } from "../../../src/ai/natural/chat-lines.js";
import { lineWords } from "../../../src/ai/natural/context/chat-turns.js";
import { fallbackLine } from "../../../src/ai/natural/fallback-line.js";
import { refusedAct } from "../../../src/ai/natural/turn-refused.js";
import type { NaturalChatLine } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveAt, liveNow } from "./support/live-agency.js";

const earlierLine: NaturalChatLine = {
  id: "line-1",
  from: "earlier",
  at: liveNow,
  kind: "text",
  text: "Spiti is ₹21,000 on 12 Dec",
};

describe("natural's seams for reads and refusal", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("keeps an earlier assistant's caption figures only when asked", async () => {
    const on = await liveAgency(test);
    await on.write({
      direction: "out",
      at: liveAt(-100),
      kind: "document",
      caption: "Spiti ₹21,000 · 12 Dec",
      fileName: "spiti.pdf",
      // Before the move to one agent, so an earlier assistant's.
      clientToken: "ai:old-turn:f1",
    });
    // The line's time is what makes it earlier: put it a day before the cut-off.
    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { conversationId: on.chat.id, clientToken: "ai:old-turn:f1" },
        data: { occurredAt: new Date("2026-11-13T10:00:00Z") },
      }),
    );
    const actionOf = async (options?: { earlierWhole?: boolean }) => {
      const { lines } = await on.inOrg((tx) => naturalChatLines(tx, on.chat.id, options));
      return lines.find((line) => line.from === "earlier")?.action;
    };

    expect(await actionOf()).toBe("sent: Spiti ·");
    expect(await actionOf({ earlierWhole: true })).toBe("sent: Spiti ₹21,000 · 12 Dec");
  });

  it("writes an earlier line whole only when asked", () => {
    expect(lineWords(earlierLine, 1_000)).not.toContain("₹21,000");
    expect(lineWords(earlierLine, 1_000, { earlierWhole: true })).toBe("Spiti is ₹21,000 on 12 Dec");
    // Everyone else's lines read the same either way.
    const yours: NaturalChatLine = { ...earlierLine, from: "you" };
    expect(lineWords(yours, 1_000)).toBe(lineWords(yours, 1_000, { earlierWhole: true }));
  });

  it("writes a reference and the saved words only on a line that has one", async () => {
    const voice: NaturalChatLine = { id: "a", from: "customer", at: liveNow, kind: "audio", text: "" };
    const photo: NaturalChatLine = { ...voice, kind: "image", text: "kya rate hai?" };
    // Natural's lines carry neither, so its words are as they were.
    expect(lineWords(voice, 1_000)).toBe("[voice note]");
    expect(lineWords(photo, 1_000)).toBe("[photo] kya rate hai?");
    expect(lineWords({ ...voice, ref: "m3" }, 1_000)).toBe("[voice note m3]");
    expect(lineWords({ ...photo, ref: "m7" }, 1_000)).toBe("[photo m7] kya rate hai?");
    expect(lineWords({ ...voice, ref: "m3", aiText: { kind: "transcript", text: "do log\nhain" } }, 1_000)).toBe(
      '[voice note m3] (heard: "do log hain")',
    );
    expect(
      lineWords({ ...photo, ref: "m7", aiText: { kind: "description", text: "A UPI receipt of ₹6,000." } }, 1_000),
    ).toBe('[photo m7] kya rate hai? (seen: "A UPI receipt of ₹6,000.")');

    // The stored words come with the line.
    const on = await liveAgency(test);
    const id = await on.write({ direction: "in", at: liveAt(-100), kind: "audio" });
    await on.inOrg((tx) =>
      tx.whatsappMessage.update({
        where: { id },
        data: { aiText: "do log hain", aiTextKind: "transcript", aiTextAt: liveNow },
      }),
    );
    const { lines } = await on.inOrg((tx) => naturalChatLines(tx, on.chat.id));
    expect(lines.find((one) => one.id === id)?.aiText).toEqual({ kind: "transcript", text: "do log hain" });
    expect(lines.find((one) => one.from === "customer" && one.id !== id)?.aiText).toBeUndefined();
  });

  it("builds the refused booking's act: the fallback line, the agency's actions kept, the task naming the booking", async () => {
    const on = await liveAgency(test);
    const prepared = await on.prepare();
    if (typeof prepared === "string") throw new Error(`The turn ended: ${prepared}`);
    const turn = { deps: on.dependencies(), input: on.turnInput(), now: liveNow, prepared, traceId: "t", actions: [] };
    const terms = {
      packageId: on.kedarkantha,
      startsOn: parseCalendarDate("2026-12-19").toString(),
      adults: 2,
      childrenAges: [],
      room: null,
      payInFull: false,
    };
    const figures = await on.quote(terms);
    const staged = new Map([
      [
        "book" as const,
        { tool: "book" as const, terms, figures, fullName: "Rohan", customerWords: "haan", via: "told" as const },
      ],
      ["add_note" as const, { tool: "add_note" as const, text: "wants a window seat" }],
    ]);

    const act = refusedAct(turn, staged, { refused: "seats_gone", message: "Only 1 seat is left." }, "haan");

    expect(act.messages).toEqual([fallbackLine("haan")]);
    expect([...act.staged.keys()]).toEqual(["add_note"]);
    expect(act.handOver).toBeNull();
    expect(act.fallback).toBe("refused:seats_gone");
    expect(act.task?.text).toContain("only 1 seat is left");
    expect(act.task?.text).toContain("Not done: the booking of");
    expect(act.task?.text).toContain("for 2 on Sat 19 Dec");
  });
});
