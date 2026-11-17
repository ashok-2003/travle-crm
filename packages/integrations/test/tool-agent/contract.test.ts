// The tool-agent contract, held by both adapters (ruling P9): the LangGraph one production runs, and the plain loop the
// domain's tests run. A turn answers after its reads with the transcript whole, runs the calls one at a time in the
// model's order, answers a bad call with a refusal and goes on, and ends on a failed model call, a newer customer line or
// LangGraph's step limit.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMemoryAiModel, type MemoryAnswer } from "../../src/ai/index.js";
import {
  createLangGraphToolAgent,
  createMemoryToolAgent,
  type AgentModelCall,
  type AgentTool,
  type AgentToolEntry,
  type ToolAgentInput,
} from "../../src/tool-agent/index.js";
import { request, signature, system, user } from "./fixtures.js";

const langGraph = createLangGraphToolAgent();
const memory = createMemoryToolAgent();

const quote: AgentTool = {
  name: "quote",
  description: "A trip's price for a party.",
  schema: z.strictObject({ trip_id: z.string(), adults: z.number().int().min(1) }),
  run: (args) => Promise.resolve(`${String(args.trip_id)}: ₹9,499 per person`),
};
const quoteCall = { name: "quote", arguments: { trip_id: "T1", adults: 2 } };

/** A turn whose model answers as scripted, through the in-memory AI model. */
function turn(tools: AgentTool[], ...answers: (string | MemoryAnswer | { ok: false; reason: "rate_limited" })[]) {
  const ai = createMemoryAiModel();
  ai.answer(...answers);
  const input: ToolAgentInput = { messages: [system, user], tools, request, call: (sent) => ai.complete(sent) };
  return { ai, input };
}

/** A turn whose model calls a tool on every answer. */
function always(settings: Pick<ToolAgentInput, "recursionLimit">): ToolAgentInput {
  const call: AgentModelCall = () =>
    Promise.resolve({
      ok: true,
      text: "",
      model: "memory-model",
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: [{ id: "call_1", name: "quote", arguments: '{"trip_id":"T1","adults":2}' }],
      finishReason: "tool_calls",
    });
  return { messages: [system, user], tools: [quote], request, call, ...settings };
}

describe.each([
  ["LangGraph", langGraph],
  ["in-memory", memory],
])("the %s tool agent", (_name, agent) => {
  it("answers after a read: the text, the model, the transcript with each reasoning detail, and the calls", async () => {
    const { input } = turn(
      [quote],
      { text: "Let me check.", toolCalls: [quoteCall], reasoningDetails: signature },
      "₹9,499 per person",
    );
    expect(await agent.run(input)).toStrictEqual({
      end: "answered",
      text: "₹9,499 per person",
      model: "memory-model",
      calls: 2,
      transcript: [
        system,
        user,
        {
          role: "assistant",
          content: "Let me check.",
          toolCalls: [{ id: "call_1", name: "quote", arguments: '{"trip_id":"T1","adults":2}' }],
          reasoningDetails: signature,
        },
        { role: "tool", content: "T1: ₹9,499 per person", toolCallId: "call_1" },
        { role: "assistant", content: "₹9,499 per person" },
      ],
    });
  });

  it("runs the calls one at a time in the model's order, each with the words of its answer", async () => {
    const events: string[] = [];
    const slow: AgentTool = {
      name: "slow",
      description: "Takes a while; the first call longest.",
      schema: z.strictObject({ n: z.number() }),
      async run(args, call) {
        events.push(`start ${String(args.n)}: ${call.words}`);
        await new Promise((resolve) => setTimeout(resolve, args.n === 1 ? 20 : 0));
        events.push(`end ${String(args.n)}`);
        return "done";
      },
    };
    const { input } = turn(
      [slow],
      {
        text: "First.",
        toolCalls: [
          { name: "slow", arguments: { n: 1 } },
          { name: "slow", arguments: { n: 2 } },
        ],
      },
      { toolCalls: [{ name: "slow", arguments: { n: 3 } }] },
      "Done.",
    );
    expect(await agent.run(input)).toMatchObject({ end: "answered", text: "Done." });
    expect(events).toEqual(["start 1: First.", "end 1", "start 2: First.", "end 2", "start 3: ", "end 3"]);
  });

  it("hands the tool arguments its schema would refuse, and answers the model the tool's own refusal", async () => {
    const seen: Record<string, unknown>[] = [];
    const getTrip: AgentTool = {
      name: "get_trip",
      description: "One trip's dates and price.",
      schema: z.strictObject({ trip_id: z.enum(["T1", "T2"]) }),
      run(args) {
        seen.push(args);
        return Promise.resolve("refused: T9 isn't one of the trips; the trips are T1, T2");
      },
    };
    const { input } = turn([getTrip], { toolCalls: [{ name: "get_trip", arguments: { trip_id: "T9" } }] }, "Which?");
    const end = await agent.run(input);
    expect(seen).toEqual([{ trip_id: "T9" }]);
    expect(end).toMatchObject({
      end: "answered",
      transcript: [
        system,
        user,
        { role: "assistant" },
        {
          role: "tool",
          content: "refused: T9 isn't one of the trips; the trips are T1, T2",
          toolCallId: "call_1",
        },
        { role: "assistant", content: "Which?" },
      ],
    });
  });

  it("answers an unknown tool, broken JSON and a throwing tool with a refusal, and goes on", async () => {
    const broken: AgentTool = { ...quote, name: "broken", run: () => Promise.reject(new Error("database down")) };
    const echo: AgentTool = { ...quote, name: "echo", run: (args) => Promise.resolve(JSON.stringify(args)) };
    const { input } = turn(
      [quote, broken, echo],
      {
        toolCalls: [
          { name: "nope", arguments: {} },
          { name: "quote", arguments: '{"trip_id":' },
          { name: "quote", arguments: "[1]" },
          { name: "broken", arguments: {} },
          { name: "echo", arguments: "" },
        ],
      },
      "Sorry, one moment.",
    );
    const end = await agent.run(input);
    expect(end).toMatchObject({ end: "answered", text: "Sorry, one moment." });
    const results = end.end === "answered" ? end.transcript.filter((message) => message.role === "tool") : [];
    expect(results.map((message) => message.content)).toEqual([
      "refused: there is no tool called nope",
      "refused: the arguments weren't JSON",
      "refused: the arguments weren't a JSON object",
      "refused: that couldn't be done just now; say you'll check and come back, and call create_task",
      "{}",
    ]);
    expect(results.map((message) => message.toolCallId)).toEqual(["call_1", "call_2", "call_3", "call_4", "call_5"]);
  });

  it("tells onTool of every call, a refused one included", async () => {
    const entries: AgentToolEntry[] = [];
    const { input } = turn([quote], { toolCalls: [{ name: "nope", arguments: "{}" }, quoteCall] }, "Done.");
    await agent.run({ ...input, onTool: (entry) => entries.push(entry) });
    expect(entries).toEqual([
      { name: "nope", arguments: "{}", result: "refused: there is no tool called nope" },
      { name: "quote", arguments: '{"trip_id":"T1","adults":2}', result: "T1: ₹9,499 per person" },
    ]);
  });

  it("ends model_failed with the reason when a model call fails, and with limit", async () => {
    const { input } = turn([quote], { toolCalls: [quoteCall] }, { ok: false, reason: "rate_limited" });
    expect(await agent.run(input)).toStrictEqual({ end: "model_failed", reason: "rate_limited", calls: 2 });
    const limited: AgentModelCall = () => Promise.resolve({ ok: false, reason: "limit" });
    expect(await agent.run({ ...input, call: limited })).toStrictEqual({
      end: "model_failed",
      reason: "limit",
      calls: 1,
    });
  });

  it("ends superseded before a model call once the customer wrote again, with no further call", async () => {
    let wroteAgain = false;
    const read: AgentTool = {
      ...quote,
      run: () => {
        wroteAgain = true;
        return Promise.resolve("T1: ₹9,499 per person");
      },
    };
    const { ai, input } = turn([read], { toolCalls: [quoteCall] }, "Never asked.");
    const end = await agent.run({ ...input, superseded: () => Promise.resolve(wroteAgain) });
    expect(end).toStrictEqual({ end: "superseded", calls: 1 });
    expect(ai.requests).toHaveLength(1);

    const before = turn([quote], "Never asked.");
    expect(await agent.run({ ...before.input, superseded: () => Promise.resolve(true) })).toStrictEqual({
      end: "superseded",
      calls: 0,
    });
    expect(before.ai.requests).toHaveLength(0);
  });
});

describe("the step limit", () => {
  it("ends steps when the model never stops calling tools", async () => {
    expect(await memory.run(always({ recursionLimit: 6 }))).toEqual(await langGraph.run(always({ recursionLimit: 6 })));
    // The default limit, 25 steps: 13 model calls.
    expect(await langGraph.run(always({}))).toStrictEqual({ end: "steps", calls: 13 });
    expect(await memory.run(always({}))).toStrictEqual({ end: "steps", calls: 13 });
  });
});
