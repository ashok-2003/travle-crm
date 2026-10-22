// The in-memory bot check: it records what it saw and answers as told.
import { describe, expect, it } from "vitest";
import { createMemoryBotCheck } from "../../src/bot-check/index.js";

describe("createMemoryBotCheck", () => {
  it("records what it saw and answers pass until told otherwise", async () => {
    const check = createMemoryBotCheck();
    expect(await check.verify({ token: "a" })).toBe("pass");
    check.willAnswer("fail");
    expect(await check.verify({ token: "b" })).toBe("fail");
    expect(check.seen()).toEqual([{ token: "a" }, { token: "b" }]);
  });
});
