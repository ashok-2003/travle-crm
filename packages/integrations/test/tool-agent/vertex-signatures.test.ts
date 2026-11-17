// Gemini on Vertex AI (ruling R14) through the LangGraph agent and the adapter's wire: an answer carries no reasoning
// details, only each call's own `extra_content` (the thought signature, on the first call of a parallel set), and Gemini
// refuses the next tool round without it. Every later request must send each call's extra data back exactly as it came.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterModel } from "../../src/ai/index.js";
import { createLangGraphToolAgent } from "../../src/tool-agent/index.js";
import { request, system, user } from "./fixtures.js";

const VERTEX = "https://aiplatform.googleapis.com/v1/projects/p/locations/global/endpoints/openapi";

/** Vertex's completions in turn, keeping the bodies it was sent. */
function vertexAnswering(...messages: object[]) {
  const bodies: { messages: Record<string, unknown>[] }[] = [];
  const fetcher: typeof fetch = (_url, init) => {
    bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as (typeof bodies)[number]);
    const message = messages.shift() ?? { role: "assistant", content: "?" };
    const finish = "tool_calls" in message ? "tool_calls" : "stop";
    return Promise.resolve(
      new Response(JSON.stringify({ model: "google/gemini-3.8-flash", choices: [{ message, finish_reason: finish }] })),
    );
  };
  return { fetcher, bodies };
}

const call = (id: string, name: string, args: object, signature?: string) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
  ...(signature === undefined ? {} : { extra_content: { google: { thought_signature: signature } } }),
});

describe("the LangGraph tool agent on Vertex AI's wire", () => {
  it("sends each call's extra_content back unchanged, round after round", async () => {
    const first = call("call_1", "get_trip", { trip_id: "T1" }, "sig-1");
    // A parallel set: Gemini signs only its first call.
    const second = [call("call_2", "quote", { trip_id: "T1" }, "sig-2"), call("call_3", "quote", { trip_id: "T2" })];
    const { fetcher, bodies } = vertexAnswering(
      { role: "assistant", content: null, tool_calls: [first] },
      { role: "assistant", content: null, tool_calls: second },
      { role: "assistant", content: "Kedarkantha is ₹9,499 per person." },
    );
    const ai = createOpenRouterModel({
      apiKey: "ya29.token",
      models: { sales_agent: ["google/gemini-3.8-flash"] },
      baseUrl: VERTEX,
      fetch: fetcher,
    });
    const end = await createLangGraphToolAgent().run({
      messages: [system, user],
      tools: ["get_trip", "quote"].map((name) => ({
        name,
        description: "Reads a trip.",
        schema: z.strictObject({ trip_id: z.string() }),
        run: () => Promise.resolve("₹9,499 per person"),
      })),
      request,
      call: (sent) => ai.complete(sent),
    });

    expect(end).toMatchObject({ end: "answered", text: "Kedarkantha is ₹9,499 per person.", calls: 3 });
    const sentCalls = (body: (typeof bodies)[number] | undefined) =>
      body?.messages.filter((message) => message.role === "assistant").map((message) => message.tool_calls);
    expect(sentCalls(bodies[1])).toEqual([[first]]);
    expect(sentCalls(bodies[2])).toEqual([[first], second]);
    for (const body of bodies) {
      expect(body).not.toHaveProperty("reasoning");
      expect(JSON.stringify(body.messages)).not.toContain("reasoning_details");
    }
  });
});
