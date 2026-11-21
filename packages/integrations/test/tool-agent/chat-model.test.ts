// The tool agent's chat model over our AI port (ruling R1): the request as our port takes it, each answer's reasoning
// details sent back on its own assistant message round after round (Gemini refuses a tool round without them), on the
// OpenRouter adapter's wire too; the bound tools as strict JSON Schema, the first answer's model pinned, a failure thrown
// with its reason, a cut-off answer asked once more, and every port call counted.
import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { messagesStateReducer } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { createMemoryAiModel, createOpenRouterModel, type AiResult } from "../../src/ai/index.js";
import { PortChatModel } from "../../src/tool-agent/chat-model.js";
import type { AgentModelCall } from "../../src/tool-agent/index.js";
import { aiToolOf, fromLangChain, toLangChain } from "../../src/tool-agent/messages.js";
import { assistant, getTrip, getTripParameters, request, signature, system, user } from "./fixtures.js";

const start = [toLangChain(system), toLangChain(user)];

function scripted() {
  const ai = createMemoryAiModel();
  const call: AgentModelCall = (sent) => ai.complete(sent);
  return { ai, model: new PortChatModel({ call, request }) };
}

/** The tool message answering an answer's first call, as LangGraph's tools node would add it. */
function resultFor(answer: BaseMessage, content: string): ToolMessage {
  const id = AIMessage.isInstance(answer) ? answer.tool_calls?.[0]?.id : undefined;
  return new ToolMessage({ content, tool_call_id: id ?? "" });
}

/** A fetch that answers OpenRouter completions in turn, keeping the bodies it was sent. */
function openRouterAnswering(...messages: object[]) {
  const bodies: { messages: Record<string, unknown>[] }[] = [];
  const fetcher: typeof fetch = (_url, init) => {
    bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as (typeof bodies)[number]);
    const message = messages.shift() ?? { content: "?" };
    return Promise.resolve(new Response(JSON.stringify({ model: "g/lite", choices: [{ message }] })));
  };
  return { fetcher, bodies };
}

describe("the chat model over our AI port", () => {
  it("sends the request's settings and the messages as our port takes them", async () => {
    const { ai, model } = scripted();
    ai.answer("Kedarkantha is ₹9,499 per person.");
    const answer = await model.invoke(start);
    expect(ai.requests).toStrictEqual([{ ...request, messages: [system, user] }]);
    expect(fromLangChain(answer)).toStrictEqual({ ...assistant, model: "memory-model" });
    expect(model._llmType()).toBe("travel-crm-ai-port");
  });

  it("sends the bound tools as JSON Schema, strict and without examples, with toolChoice auto", async () => {
    const { ai, model } = scripted();
    ai.answer("One", "Two");
    const tool = aiToolOf(getTrip);
    await model.bindTools([tool]).invoke(start);
    await model.bindTools([{ type: "function", function: tool }]).invoke(start);
    for (const sent of ai.requests) {
      expect(sent).toMatchObject({ toolChoice: "auto", tools: [{ ...tool, parameters: getTripParameters }] });
      expect(JSON.stringify(sent.tools)).not.toMatch(/"examples":\[|\$schema/);
    }
  });

  it("sends no tools and no tool choice when none are bound", async () => {
    const { ai, model } = scripted();
    ai.answer("One", "Two");
    await model.invoke(start);
    await model.bindTools([]).invoke(start);
    for (const sent of ai.requests) {
      expect(sent).not.toHaveProperty("tools");
      expect(sent).not.toHaveProperty("toolChoice");
    }
  });

  it("refuses a tool it can't describe as a function", () => {
    const { model } = scripted();
    expect(() => model.bindTools([{ name: "get_trip", schema: getTrip.schema }])).toThrow(
      "bindTools takes our AiTool or an OpenAI function definition",
    );
  });

  it("names the first answer's model on every later call, across bound copies, unless the request names one", async () => {
    const { ai, model } = scripted();
    ai.answer({ text: "One", model: "g/lite" }, { text: "Two", model: "g/flash" }, "Three");
    await model.invoke(start);
    await model.invoke(start);
    await model.bindTools([aiToolOf(getTrip)]).invoke(start);
    expect(ai.requests.map((sent) => sent.model)).toEqual([undefined, "g/lite", "g/lite"]);

    const chosen = createMemoryAiModel();
    const tryIt = new PortChatModel({
      call: (sent) => chosen.complete(sent),
      request: { ...request, model: "try/it" },
    });
    chosen.answer({ text: "One", model: "g/lite" }, "Two");
    await tryIt.invoke(start);
    await tryIt.invoke(start);
    expect(chosen.requests.map((sent) => sent.model)).toEqual(["try/it", "try/it"]);
  });

  it("pins no model when the first call fails", async () => {
    const { ai, model } = scripted();
    ai.answer({ ok: false, reason: "unavailable" }, { text: "Two", model: "g/flash" }, "Three");
    await expect(model.invoke(start)).rejects.toThrow();
    await model.invoke(start);
    await model.invoke(start);
    expect(ai.requests.map((sent) => sent.model)).toEqual([undefined, undefined, "g/flash"]);
  });

  it("sends the first answer's reasoning details back on its assistant message in the next call", async () => {
    const { ai, model } = scripted();
    ai.answer({
      toolCalls: [{ name: "get_trip", arguments: { trip_id: "T1" } }],
      reasoningDetails: [{ signature: "s1" }],
    });
    ai.answer("Done");
    const bound = model.bindTools([aiToolOf(getTrip)]);
    const first = await bound.invoke(start);
    await bound.invoke([...start, first, resultFor(first, "Kedarkantha, 6 days")]);
    expect(ai.requests[1]?.messages.find((m) => m.role === "assistant")?.reasoningDetails).toEqual([
      { signature: "s1" },
    ]);
    expect(ai.requests[1]?.messages).toStrictEqual([
      system,
      user,
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "get_trip", arguments: '{"trip_id":"T1"}' }],
        reasoningDetails: [{ signature: "s1" }],
        model: "memory-model",
      },
      { role: "tool", content: "Kedarkantha, 6 days", toolCallId: "call_1" },
    ]);
  });

  it("keeps each round's reasoning details on its own answer, through LangGraph's message list, round after round", async () => {
    const { ai, model } = scripted();
    ai.answer(
      { toolCalls: [{ name: "get_trip", arguments: '{"trip_id":"T1",}' }], reasoningDetails: [{ signature: "s1" }] },
      { text: "And the price:", toolCalls: [{ name: "quote", arguments: { trip_id: "T1" } }], reasoningDetails: "s2" },
      { text: "₹9,499 per person.", reasoningDetails: [{ signature: "s3" }] },
    );
    const bound = model.bindTools([aiToolOf(getTrip)]);
    let list = messagesStateReducer([], start);
    for (let round = 0; round < 3; round += 1) {
      const answer = await bound.invoke(list);
      const calls = AIMessage.isInstance(answer) ? (answer.tool_calls ?? []) : [];
      list = messagesStateReducer(
        list,
        calls.length > 0 ? [answer, resultFor(answer, `result ${String(round)}`)] : answer,
      );
    }
    const assistants = (index: number) => ai.requests[index]?.messages.filter((m) => m.role === "assistant");
    expect(assistants(2)).toStrictEqual([
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "get_trip", arguments: '{"trip_id":"T1",}' }],
        reasoningDetails: [{ signature: "s1" }],
        model: "memory-model",
      },
      {
        role: "assistant",
        content: "And the price:",
        toolCalls: [{ id: "call_2", name: "quote", arguments: '{"trip_id":"T1"}' }],
        reasoningDetails: "s2",
        model: "memory-model",
      },
    ]);
    expect(list.map(fromLangChain).at(-1)).toStrictEqual({
      role: "assistant",
      content: "₹9,499 per person.",
      reasoningDetails: [{ signature: "s3" }],
      model: "memory-model",
    });
  });

  it("sends OpenRouter's reasoning_details back, exactly as they came, in the next request's body", async () => {
    const second = [{ ...signature[0], data: "c2lnLTI=", id: "tool_1" }];
    const { fetcher, bodies } = openRouterAnswering(
      {
        content: null,
        tool_calls: [{ id: "tool_0", type: "function", function: { name: "get_trip", arguments: '{"trip_id":"T1"}' } }],
        reasoning_details: signature,
      },
      {
        content: "",
        tool_calls: [{ id: "tool_1", type: "function", function: { name: "quote", arguments: '{"trip_id":"T1"}' } }],
        reasoning_details: second,
      },
      { content: "₹9,499 per person." },
    );
    const openRouter = createOpenRouterModel({
      apiKey: "sk-or-test",
      models: { sales_agent: ["g/lite"] },
      fetch: fetcher,
    });
    const bound = new PortChatModel({ call: (sent) => openRouter.complete(sent), request }).bindTools([
      aiToolOf(getTrip),
    ]);
    let list: BaseMessage[] = start;
    for (const result of ["Kedarkantha, 6 days", "₹9,499"]) {
      const answer = await bound.invoke(list);
      list = messagesStateReducer(list, [answer, resultFor(answer, result)]);
    }
    await bound.invoke(list);
    const sentBack = (index: number) => bodies[index]?.messages.filter((m) => m.role === "assistant");
    expect(sentBack(1)).toStrictEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "tool_0", type: "function", function: { name: "get_trip", arguments: '{"trip_id":"T1"}' } }],
        reasoning_details: signature,
      },
    ]);
    expect(sentBack(2)?.map((m) => m.reasoning_details)).toStrictEqual([signature, second]);
    expect(bodies.map((body) => body.messages.find((m) => m.role === "tool")?.tool_call_id)).toEqual([
      undefined,
      "tool_0",
      "tool_0",
    ]);
  });

  it("returns the answer with its usage, its model and why it stopped", async () => {
    const answered: AiResult = {
      ok: true,
      text: "Hi",
      model: "g/lite",
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 100,
      reasoningTokens: 12,
      finishReason: "stop",
    };
    const model = new PortChatModel({ call: () => Promise.resolve(answered), request });
    const answer = await model.invoke(start);
    expect(AIMessage.isInstance(answer) ? answer.usage_metadata : null).toEqual({
      input_tokens: 120,
      output_tokens: 30,
      total_tokens: 150,
      input_token_details: { cache_read: 100 },
      output_token_details: { reasoning: 12 },
    });
    expect(answer.response_metadata).toMatchObject({ model: "g/lite", finishReason: "stop" });
    // Kept on the answer for the next request, so the chain sends its tool round back to an endpoint serving it.
    expect(fromLangChain(answer).model).toBe("g/lite");
  });

  it("throws the failure's reason, and limit", async () => {
    const { ai, model } = scripted();
    ai.answer({ ok: false, reason: "rate_limited" });
    await expect(model.invoke(start)).rejects.toMatchObject({ name: "AgentModelFailure", reason: "rate_limited" });
    const limited = new PortChatModel({ call: () => Promise.resolve({ ok: false, reason: "limit" }), request });
    await expect(limited.invoke(start)).rejects.toMatchObject({ name: "AgentModelFailure", reason: "limit" });
  });

  it("asks a cut-off answer once more at minimal effort, and fails a second cut-off as unavailable", async () => {
    const { ai, model } = scripted();
    ai.answer({ text: "Kedarkantha is a six-day tr", finishReason: "length", model: "g/lite" }, "Kedarkantha: ₹9,499.");
    const answer = await model.invoke(start);
    expect(fromLangChain(answer).content).toBe("Kedarkantha: ₹9,499.");
    expect(ai.requests.map((sent) => [sent.reasoning, sent.model])).toEqual([
      [{ effort: "low" }, undefined],
      [{ effort: "minimal" }, "g/lite"],
    ]);
    expect(ai.requests[1]?.messages).toStrictEqual(ai.requests[0]?.messages);

    ai.answer({ text: "Kedar", finishReason: "length" }, { text: "Kedarkan", finishReason: "length" });
    await expect(model.invoke(start)).rejects.toMatchObject({ name: "AgentModelFailure", reason: "unavailable" });
    expect(ai.requests.map((sent) => sent.reasoning?.effort)).toEqual(["low", "minimal", "low", "minimal"]);

    ai.answer({ text: "Kedar", finishReason: "length" }, { ok: false, reason: "rate_limited" });
    await expect(model.invoke(start)).rejects.toMatchObject({ reason: "rate_limited" });
  });

  it("returns a cut-off answer that made calls as it is", async () => {
    const { ai, model } = scripted();
    ai.answer({ toolCalls: [{ name: "get_trip", arguments: '{"trip_id":"T' }], finishReason: "length" });
    const answer = await model.bindTools([aiToolOf(getTrip)]).invoke(start);
    expect(fromLangChain(answer).toolCalls).toEqual([{ id: "call_1", name: "get_trip", arguments: '{"trip_id":"T' }]);
    expect(ai.requests).toHaveLength(1);
  });

  it("counts every port call, the retry included, across bound copies", async () => {
    const { ai, model } = scripted();
    const bound = model.bindTools([aiToolOf(getTrip)]);
    ai.answer("One", { text: "Tw", finishReason: "length" }, "Two", { ok: false, reason: "unavailable" });
    await model.invoke(start);
    await bound.invoke(start);
    await expect(bound.bindTools([]).invoke(start)).rejects.toThrow();
    expect([model.calls, bound.calls]).toEqual([4, 4]);
  });
});
