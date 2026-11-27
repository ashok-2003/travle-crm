// What the check finds in a reply (the owner, 2026-11-26 and 27): IDs, tool calls and tools' names as text, the model's
// notes about the customer, and code; nothing else.
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

  it("finds a tool's name written without its bracket (live, 17 and 23 Nov)", () => {
    expect(codeInReply('[stay_quiet reason: The customer just said "Ok", so no reply is needed.]', [])).toBe(
      "a tool's name",
    );
    expect(codeInReply("The seats are already held (`book` tool was called).", [])).toBe("a tool's name");
    expect(codeInReply("Maine update_lead kar diya", [])).toBe("a tool's name");
  });

  it("does not flag book or quote as plain words", () => {
    expect(codeInReply("Book karein? Quote bhej doon?", [])).toBeNull();
    expect(codeInReply("Kis date ke liye book karna hai?", [])).toBeNull();
  });

  it("finds the model's notes about the customer instead of words to them (live, 23, 24 and 27 Nov)", () => {
    expect(codeInReply('The customer said "Ok sure", so nothing is open.', [])).toBe("notes about the customer");
    expect(codeInReply("The lead has been marked as not active since they won't book.", [])).toBe(
      "notes about the customer",
    );
    expect(codeInReply("The lead guide meets you at Manali. The customer desk is open till 8.", [])).toBeNull();
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
