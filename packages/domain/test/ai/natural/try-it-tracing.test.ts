// Try it on the natural agent as traces: each dry turn is one traced turn of its test chat, marked as a Try it test, with
// its model calls inside as generations and what it learned noted: each tool call with its arguments and result, the
// guards' verdicts, a fallback and its reason, the staged actions and the prompt version. Tracing changes nothing the
// turn does.
import type { TestAiLine } from "@travel-crm/contracts/ai";
import { withTracing } from "@travel-crm/integrations/ai";
import { createMemoryTracing, notedTurn, type MemoryTracing } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_NATURAL_PROMPT, naturalTryItTurn, type NaturalPrompt } from "../../../src/ai/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { naturalAgency } from "./support/natural-agency.js";

// Mon 16 Nov 2026, noon in Kolkata.
const NOW = new Date("2026-11-16T06:30:00Z");
const CHAT_ID = "019a8f2e-7c41-7a10-9b2e-3d4c5b6a7f80";
const reply = "Kedarkantha ₹9,499 per person se shuru hai. Kab ka plan hai?";

const shown = (tracing: MemoryTracing, index = 0) => {
  const turn = tracing.turns[index];
  return turn === undefined ? null : notedTurn(turn);
};

describe("Try it on the natural agent, traced", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const agency = await naturalAgency(test);
    const tracing = createMemoryTracing();
    const member = memberOf(agency.organizationId, "org-owner");
    const deps = {
      db: test.db,
      ai: withTracing(agency.model, tracing),
      agencyName: () => Promise.resolve("Case Trips"),
      tracing,
    };
    const tryIt = (messages: readonly TestAiLine[], chatId?: string, prompt: NaturalPrompt = BUILT_IN_NATURAL_PROMPT) =>
      naturalTryItTurn(
        deps,
        member,
        { messages, state: null, prompt, ...(chatId === undefined ? {} : { chatId }) },
        NOW,
      );
    return { ...agency, tracing, member, tryIt };
  }

  it("links each of its model calls to the Langfuse prompt it ran, and a built-in turn's to none", async () => {
    const on = await world();
    const live: NaturalPrompt = {
      version: "langfuse:whatsapp-agent/natural-system@7",
      text: BUILT_IN_NATURAL_PROMPT.text,
      source: { name: "whatsapp-agent/natural-system", version: 7, label: "production" },
    };
    on.model.answer(
      { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] },
      { text: reply },
      { text: reply },
    );
    await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate?" }], CHAT_ID, live);
    await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate?" }], CHAT_ID);

    const [fromLangfuse, builtIn] = on.tracing.turns;
    expect(fromLangfuse?.start).toMatchObject({
      prompt: { name: "whatsapp-agent/natural-system", version: 7 },
      metadata: { promptVersion: live.version, promptLabel: "production" },
    });
    expect(fromLangfuse?.generations.map((call) => call.prompt)).toEqual([
      { name: "whatsapp-agent/natural-system", version: 7 },
      { name: "whatsapp-agent/natural-system", version: 7 },
    ]);
    expect(builtIn?.start).not.toHaveProperty("prompt");
    expect(builtIn?.start.metadata).toMatchObject({ promptVersion: "built-in-1", promptLabel: null });
    expect(builtIn?.generations.map((call) => call.prompt)).toEqual([null]);
  });

  it("is one turn of its test chat: the chat in, the reply out, its calls inside and what it learned noted", async () => {
    const on = await world();
    on.model.answer(
      { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }] },
      { text: reply, toolCalls: [{ name: "update_lead", arguments: { trip_id: "T1", adults: 2 } }] },
    );
    const answer = await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate? Hum 2 log hain" }], CHAT_ID);
    expect(answer).toMatchObject({ outcome: "replied", messages: [reply] });

    expect(on.tracing.turns).toHaveLength(1);
    const [turn] = on.tracing.turns;
    expect(turn?.start).toMatchObject({
      name: "whatsapp-agent.natural.try-it",
      sessionId: `try-it:${CHAT_ID}`,
      organizationId: on.organizationId,
      userId: on.member.userId,
      tags: ["whatsapp-agent", "natural", "try-it"],
      metadata: { agent: "natural", tryIt: true, promptVersion: BUILT_IN_NATURAL_PROMPT.version },
    });
    // Both model calls, each a generation of this turn, the tool calls in the first's answer.
    expect(turn?.generations.map((call) => call.start.name)).toEqual(["ai.sales_agent", "ai.sales_agent"]);
    expect(turn?.generations[0]?.end?.output).toMatchObject({
      tool_calls: [{ function: { name: "get_trip", arguments: '{"trip_id":"T1"}' } }],
    });
    expect(JSON.stringify(turn?.generations[1]?.end?.output)).toContain("₹9,499");

    const seen = shown(on.tracing);
    expect(seen?.input).toEqual([{ role: "user", content: "Kedarkantha ka rate? Hum 2 log hain" }]);
    expect(seen?.output).toEqual({ role: "assistant", content: reply });
    expect(seen?.metadata).toMatchObject({
      promptVersion: BUILT_IN_NATURAL_PROMPT.version,
      outcome: "replied",
      fallback: null,
      toolCalls: [
        {
          call: 1,
          name: "get_trip",
          arguments: '{"trip_id":"T1"}',
          result: expect.stringContaining("Kedarkantha Trek") as string,
          refused: false,
        },
        { call: 2, name: "update_lead", arguments: '{"trip_id":"T1","adults":2}', refused: false },
      ],
      guards: answer.trace.guards,
      staged: answer.trace.staged,
      actions: answer.actions,
      nextState: answer.state,
    });
    expect(answer.trace.guards.length).toBeGreaterThan(0);
    expect(answer.trace.staged.map((action) => action.tool)).toEqual(["update_lead"]);
    expect(seen?.statusMessage).toBe("replied");
    expect(seen?.level ?? "DEFAULT").toBe("DEFAULT");
    expect(on.tracing.strayNotes).toEqual([]);
  });

  it("notes a fallback and its reason as an error, and gives a chat with no id a random session", async () => {
    const on = await world();
    on.model.answer({ ok: false, reason: "unavailable" });
    const answer = await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate?" }]);
    expect(answer.outcome).toBe("fallback");
    on.model.answer({ text: reply });
    await on.tryIt([{ from: "customer", text: "Kedarkantha ka rate?" }]);

    const [failed, next] = on.tracing.turns;
    expect(failed?.start.sessionId).toMatch(/^try-it:[0-9a-f-]{36}$/);
    expect(next?.start.sessionId).toMatch(/^try-it:[0-9a-f-]{36}$/);
    expect(next?.start.sessionId).not.toBe(failed?.start.sessionId);
    expect(failed?.generations[0]?.end).toEqual({ level: "ERROR", statusMessage: "unavailable" });
    expect(shown(on.tracing)).toMatchObject({
      output: { role: "assistant", content: answer.messages[0] },
      metadata: { outcome: "fallback", fallback: "model_failed:unavailable", staged: [], toolCalls: [] },
      statusMessage: "fallback: model_failed:unavailable",
      level: "ERROR",
    });
  });

  it("notes two messages with the --- line between them, so a blank line inside one stays spacing", async () => {
    const on = await world();
    const list = "Kedarkantha:\n\n• 6 days\n• Saare meals";
    on.model.answer({ text: `${list}\n---\nKitne log?` });
    const answer = await on.tryIt([{ from: "customer", text: "Kedarkantha mein kya hai?" }], CHAT_ID);
    expect(answer.messages).toEqual([list, "Kitne log?"]);
    expect(shown(on.tracing)?.output).toEqual({ role: "assistant", content: `${list}\n---\nKitne log?` });
  });

  it("answers as the untraced dry turn does", async () => {
    const on = await world();
    on.model.answer({ text: reply }, { text: reply });
    const traced = await on.tryIt([{ from: "customer", text: "Hi" }], CHAT_ID);
    const plain = await naturalTryItTurn(
      { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Case Trips") },
      on.member,
      { messages: [{ from: "customer", text: "Hi" }], state: null, prompt: BUILT_IN_NATURAL_PROMPT },
      NOW,
    );
    // The same answer, but for the times the turn took.
    const timeless = ({ trace, ...answer }: typeof traced) => ({
      ...answer,
      trace: { ...trace, durationMs: 0, calls: trace.calls.map((call) => ({ ...call, ms: 0 })) },
    });
    expect(timeless(traced)).toEqual(timeless(plain));
    expect(on.tracing.turns).toHaveLength(1);
  });
});
