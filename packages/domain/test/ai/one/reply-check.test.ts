// What the check finds in a reply (the owner, 2026-11-26): IDs, tool calls as text and code; nothing else.
import { describe, expect, it } from "vitest";
import { codeInReply, codeWords } from "../../../src/ai/one/reply-check.js";

const codes = ["T6", "T7", "B2"];

describe("codeInReply", () => {
  it("names the codes found, as whole words", () => {
    expect(codeInReply("Manali (T7) is on", codes)).toBe("T7");
    expect(codeInReply("T6 ya T7 dekhiye", codes)).toBe("T6, T7");
    expect(codeInReply("Ye B2 bhej diya", codes)).toBe("B2");
  });

  it("does not flag B2B, durations, prices, dates or codes this turn does not have", () => {
    expect(codeInReply("We run B2B trips, 4N/5D from ₹12,500 on 4 Dec.", codes)).toBeNull();
    expect(codeInReply("T9 is not one of ours", codes)).toBeNull();
    expect(codeInReply("t7 lowercase", codes)).toBeNull();
  });

  it("finds a tool call or an arrow line written as text", () => {
    expect(codeInReply('→ send_brochure(brochure_id: "B4")\nYe raha plan', [])).toBe("a tool call written as text");
    expect(codeInReply("Sure `update_lead(adults: 2)` done", [])).toBe("a tool call written as text");
    expect(codeInReply("send_brochure (x)", [])).toBe("a tool call written as text");
  });

  it("finds code", () => {
    expect(codeInReply("```json\n{}\n```", [])).toBe("code");
    expect(codeInReply('{"a": 1}', [])).toBe("code");
  });

  it("is null for clean words", () => {
    expect(codeInReply("Manali 5N/6D mein hotel stay hai. Kab chalna hai?", codes)).toBeNull();
  });
});

describe("codeWords", () => {
  it("names what was found", () => {
    expect(codeWords("T7")).toContain("Your reply showed T7, which the customer must never see.");
  });
});
