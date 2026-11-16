// The lite bench's case format: the earlier shape still reads, and a typo in a move or a hand-over reason is refused.
import { describe, expect, it } from "vitest";
import { liteCase } from "../../src/ai/lite-cases.js";
import { handOverReasons, liteMoveKinds } from "../../src/ai/lite.js";

const earlier = {
  name: "an earlier case",
  chat: [{ from: "customer", text: "hello" }],
  expect: { sent: true, flagged: true, excludes: ["x"], actions: { files: false, payment: false } },
};

describe("the lite case format", () => {
  it("the earlier case shape still reads", () => {
    const parsed = liteCase.parse(earlier);
    expect(parsed.agency.packages).toEqual(["manali", "spiti", "kashmir"]);
    expect(parsed.scripted).toEqual([]);
    expect(parsed.chat[0]?.kind).toBe("text");
  });

  it("refuses an unknown key, an unknown move and an unknown hand-over reason", () => {
    expect(liteCase.safeParse({ ...earlier, extra: 1 }).success).toBe(false);
    expect(liteCase.safeParse({ ...earlier, expect: { sent: true, move: "dance" } }).success).toBe(false);
    expect(liteCase.safeParse({ ...earlier, expect: { sent: true, handOver: "bored" } }).success).toBe(false);
    expect(
      liteCase.safeParse({ ...earlier, expect: { sent: true, move: "greet", handOver: "discount" } }).success,
    ).toBe(true);
  });

  it("names the moves and reasons once", () => {
    expect(liteMoveKinds).toContain("hand_over");
    expect(handOverReasons).toContain("check_failed");
  });
});
