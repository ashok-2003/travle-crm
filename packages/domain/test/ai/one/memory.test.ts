// What the one agent reads of a chat: the summary and only the lines after its point, the new messages always kept.
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatMemoryOf } from "../../../src/ai/one/memory.js";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveAt, liveNow } from "../natural/support/live-agency.js";

describe("what the one agent reads of the chat", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat with the customer's first line plus `count` more, one a minute apart, ending a minute before the turn. */
  async function world(count: number) {
    const on = await liveAgency(test);
    for (let n = 0; n < count; n += 1) {
      await on.write({ direction: "in", at: liveAt(-60 * (count - n)), body: `line ${String(n + 1)}` });
    }
    const trace = startNaturalTrace({ version: "v" }, 0, "one");
    const read = async () => {
      const prepared = await on.prepare();
      if (typeof prepared === "string") throw new Error(prepared);
      const deps = { ...on.dependencies(), toolAgent: createMemoryToolAgent() };
      return chatMemoryOf(deps, prepared, on.turnInput(), liveNow, trace);
    };
    return { ...on, trace, read };
  }

  it("reads the whole read chat when there is no summary yet", async () => {
    const on = await world(5);
    const memory = await on.read();
    expect(memory.summary).toBeNull();
    expect(memory.lines).toHaveLength(6);
  });

  it("gives the summary and only the lines after its point", async () => {
    const on = await world(35);
    await on.write({ direction: "out", at: liveAt(-50), body: "Hello!", clientToken: "ai:hello" });
    await on.write({ direction: "in", at: liveAt(-40), body: "question" });
    on.model.answer("Notes: Kedarkantha, December.");
    const memory = await on.read();
    // The summary covers all 37 lines; only the customer's new one is read besides it.
    expect(memory.summary).toBe("Notes: Kedarkantha, December.");
    expect(memory.lines.map((line) => line.text)).toEqual(["question"]);
    expect(on.trace.finish("sent", null, 1).flags).toContain("summary:refreshed");
  });

  it("keeps the new messages after a refresh that covered them", async () => {
    const on = await world(35);
    on.model.answer("Notes.");
    const memory = await on.read();
    expect(memory.lines.map((line) => line.text)).toContain("line 35");
  });

  it("reads what prepare read when the refresh failed", async () => {
    const on = await world(35);
    on.model.answer({ ok: false, reason: "unavailable" });
    const memory = await on.read();
    expect(memory.summary).toBeNull();
    expect(memory.lines).toHaveLength(36);
    expect(on.trace.finish("sent", null, 1).flags).toContain("summary:failed:unavailable");
  });
});
