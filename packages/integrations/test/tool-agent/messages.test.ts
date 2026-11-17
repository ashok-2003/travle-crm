// Our port's messages through LangChain's types and LangGraph's message list, whole: an answer's raw calls (broken JSON
// included), its reasoning details (OpenRouter) and each call's own extra data (Vertex AI), which Gemini refuses a tool
// round without. And a tool as the model reads it.
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { messagesStateReducer } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { aiToolOf, fromLangChain, toLangChain } from "../../src/tool-agent/messages.js";
import {
  assistant,
  assistantWithCalls,
  assistantWithSignedCalls,
  getTrip,
  getTripParameters,
  system,
  toolResult,
  user,
  userWithAttachment,
} from "./fixtures.js";

describe("messages between our port and LangChain", () => {
  it("keeps every message whole through LangChain and back, reasoning details and raw arguments included", () => {
    for (const message of [
      system,
      user,
      userWithAttachment,
      assistant,
      assistantWithCalls,
      assistantWithSignedCalls,
      toolResult,
    ]) {
      expect(fromLangChain(toLangChain(message))).toStrictEqual(message);
    }
    expect(fromLangChain(toLangChain(assistantWithCalls)).toolCalls?.[0]?.arguments).toBe('{"trip_id":"T1",}');
  });

  it("gives LangGraph the calls parsed for its routing, an object of {} when the text isn't one", () => {
    const message = toLangChain(assistantWithCalls);
    expect(AIMessage.isInstance(message) ? message.tool_calls : null).toEqual([
      { type: "tool_call", id: "call_1", name: "get_trip", args: {} },
      { type: "tool_call", id: "call_2", name: "quote", args: { trip_id: "T1", adults: 2 } },
    ]);
    const notAnObject = toLangChain({
      ...assistantWithCalls,
      toolCalls: [{ id: "c", name: "quote", arguments: "[1]" }],
    });
    expect(AIMessage.isInstance(notAnObject) ? notAnObject.tool_calls?.[0]?.args : null).toEqual({});
  });

  it("keeps the messages whole through LangGraph's message list", () => {
    const list = messagesStateReducer(
      [toLangChain(system), toLangChain(userWithAttachment)],
      [toLangChain(assistantWithCalls), toLangChain(toolResult), toLangChain(assistantWithSignedCalls)],
    );
    expect(list.map(fromLangChain)).toStrictEqual([
      system,
      userWithAttachment,
      assistantWithCalls,
      toolResult,
      assistantWithSignedCalls,
    ]);
  });

  it("reads a message LangChain built itself: its parsed calls as JSON, its text blocks as words", () => {
    const built = new AIMessage({
      content: [
        { type: "text", text: "Checking " },
        { type: "text", text: "dates." },
      ],
      tool_calls: [{ id: "c1", name: "get_trip", args: { trip_id: "T2" } }],
    });
    expect(fromLangChain(built)).toStrictEqual({
      role: "assistant",
      content: "Checking dates.",
      toolCalls: [{ id: "c1", name: "get_trip", arguments: '{"trip_id":"T2"}' }],
    });
    expect(fromLangChain(new HumanMessage("Hi"))).toStrictEqual({ role: "user", content: "Hi" });
  });

  it("describes a tool as JSON Schema of its input, without $schema or any examples", () => {
    expect(aiToolOf(getTrip)).toStrictEqual({
      name: "get_trip",
      description: "One trip's dates, price and what it includes.",
      parameters: getTripParameters,
    });
  });

  it("reads an argument with a default as optional to the model", () => {
    const schema = z.strictObject({ trip_id: z.string(), adults: z.number().int().default(2) });
    const { parameters } = aiToolOf({ name: "quote", description: "A trip's price.", schema });
    expect(parameters.required).toEqual(["trip_id"]);
    expect(parameters.properties).toMatchObject({ adults: { default: 2 } });
  });
});
