// The in-memory bot check: it records what it saw and answers as told.
import { describe, expect, it } from "vitest";
import { createMemoryBotCheck } from "../../src/bot-check/index.js";

describe("createMemoryBotCheck", () => {
  it("records what it saw and answers pass until told otherwise", async () => {
    const check = createMemoryBotCheck();
    expect(await check.verify({ token: "a", address: "1.2.3.4" })).toBe("pass");
    check.willAnswer("fail");
    expect(await check.verify({ token: "b", address: null })).toBe("fail");
    expect(check.seen()).toEqual([
      { token: "a", address: "1.2.3.4" },
      { token: "b", address: null },
    ]);
  });
});
