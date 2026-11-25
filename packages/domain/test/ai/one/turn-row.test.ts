// A one turn's row in ai_turn_trace: its fields from the turn, a row for each turn that read the chat and none for a
// gate's, the Langfuse version it ran (0 for the built-in text).
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryPrompts, type ManagedPrompt } from "@travel-crm/integrations/prompts";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ONE_PROMPT_NAME } from "../../../src/ai/one/prompt.js";
import { toolTurnRowOf } from "../../../src/ai/one/turn-row.js";
import { runOneTurn } from "../../../src/ai/one/turn.js";
import { createTraceSink } from "../../../src/ai/traces/trace-sink.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveNow } from "../natural/support/live-agency.js";

const WORDS = "Haan! Kedarkantha har Saturday December mein hai.";
const call = { model: "m1", ms: 5, inputTokens: 100, cachedTokens: 40, outputTokens: 10, reasoningTokens: 0 };
const tool = (result: string) => ({
  name: "get_trip",
  arguments: "{}",
  result,
  refused: result.startsWith("refused:"),
});

describe("a one turn's row", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world(prompts: ManagedPrompt[] = []) {
    const on = await liveAgency(test);
    const logger = createMemoryLogger();
    const toolTurns = createTraceSink({ db: test.db, logger });
    const run = (input = on.turnInput(), at = liveNow) =>
      runOneTurn(
        { ...on.dependencies(), prompts: createMemoryPrompts(prompts), toolAgent: createMemoryToolAgent(), toolTurns },
        input,
        at,
      );
    const rows = () => on.inOrg((tx) => tx.aiTurnTrace.findMany({ where: { conversationId: on.chat.id } }));
    return { ...on, run, rows };
  }

  it("names the Langfuse version it ran, 0 for the built-in text", async () => {
    const live = await world([{ name: ONE_PROMPT_NAME, version: 3, label: "production", text: "Be Riya." }]);
    live.model.answer({ text: WORDS });
    await live.run();
    expect((await live.rows())[0]?.promptVersions).toEqual({ "real-agent": 3 });
    const builtIn = await world();
    builtIn.model.answer({ text: WORDS });
    await builtIn.run();
    expect((await builtIn.rows())[0]?.promptVersions).toEqual({ "real-agent": 0 });
  });

  it("writes one row for each turn that prepared, none for a gate's", async () => {
    const on = await world();
    on.model.answer({ text: WORDS });
    expect(await on.run()).toBe("replied");
    expect(await on.rows()).toHaveLength(1);
    // A chat the agency has switched off: the reply's gate ends it before anything is read.
    const quiet = await world();
    await quiet.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    expect(await quiet.run()).not.toBe("replied");
    expect(await quiet.rows()).toHaveLength(0);
    // 02:00 on the agency's clock: the follow-up's gate ends it before the model.
    const night = new Date("2026-11-20T20:30:00Z");
    const nudge = { ...on.turnInput(), kind: "nudge" as const, token: `nudge:${on.chat.id}:1` };
    expect(await on.run(nudge, night)).toBe("night");
    expect(await on.rows()).toHaveLength(1);
  });

  it("builds the row from the turn: counts, the last model, refusals counted", () => {
    const trace = {
      agent: "one" as const,
      promptVersion: "built-in-1",
      promptLabel: null,
      outcome: "replied",
      fallback: null,
      restarted: null,
      durationMs: 900,
      calls: [
        { ...call, finishReason: "tool_calls", words: null, tools: [tool("ok"), tool("refused: no seats")] },
        { ...call, model: "m2", finishReason: "stop", words: "hi", tools: [] },
      ],
      guards: [],
      staged: [],
      flags: [],
    };
    const done = { outcome: "replied", reason: null, messages: ["hi"], actions: [], fallback: null, leadId: "lead-1" };
    const input = { organizationId: "o", conversationId: "c", kind: "reply" as const, token: "t" };
    const row = toolTurnRowOf(
      input,
      done,
      trace,
      { version: "built-in-1", text: "" },
      new Date("2026-11-20T10:00:00Z"),
    );
    expect(row).toMatchObject({
      kind: "reply",
      leadId: "lead-1",
      model: "m2",
      inputTokens: 200,
      outputTokens: 20,
      cachedTokens: 80,
      failedChecks: 1,
      durationMs: 900,
      promptVersions: { "real-agent": 0 },
    });
  });
});
