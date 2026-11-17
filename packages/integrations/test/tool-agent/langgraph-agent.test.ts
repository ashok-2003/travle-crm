// The LangGraph adapter keeps the chat on the server (review I1): with any of LangChain's tracing or verbose variables
// set, a turn sends nothing to LangSmith or anywhere else, and prints no prompt or answer to the logs.
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMemoryAiModel } from "../../src/ai/index.js";
import { createLangGraphToolAgent } from "../../src/tool-agent/index.js";
import { request, system, user } from "./fixtures.js";

const variables = [
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_VERBOSE",
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the LangGraph tool agent", () => {
  it.each(variables)("sends nothing anywhere and prints nothing, even with %s set", async (variable) => {
    vi.stubEnv(variable, "true");
    vi.stubEnv("LANGSMITH_API_KEY", "lsv2_pt_test");
    const fetched: string[] = [];
    vi.stubGlobal("fetch", (url: unknown) => {
      fetched.push(String(url));
      return Promise.resolve(new Response("{}"));
    });
    const printed: unknown[] = [];
    const keep = (...args: unknown[]) => {
      printed.push(args);
    };
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation(keep);
    }

    const ai = createMemoryAiModel();
    ai.answer({ text: "Let me check.", toolCalls: [{ name: "quote", arguments: { trip_id: "T1" } }] }, "₹9,499");
    const end = await createLangGraphToolAgent().run({
      messages: [system, user],
      tools: [
        {
          name: "quote",
          description: "A trip's price.",
          schema: z.strictObject({ trip_id: z.string() }),
          run: () => Promise.resolve("₹9,499 per person"),
        },
      ],
      request,
      call: (sent) => ai.complete(sent),
    });
    // LangChain hands traces to LangSmith in the background: wait for them to go.
    await awaitAllCallbacks();

    expect(end).toMatchObject({ end: "answered", text: "₹9,499", calls: 2 });
    expect(fetched).toEqual([]);
    expect(printed).toEqual([]);
  });
});
