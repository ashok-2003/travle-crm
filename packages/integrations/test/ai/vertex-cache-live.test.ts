// Vertex AI's context cache, live (brief C), with the service account whose key file VERTEX_SA_FILE names (its path only:
// the key is read here and never printed). A 20k-character system message and the one agent's real tools, converted as
// the tool agent converts them: the cached calls make the same tool call as an uncached one, the second reads the cache,
// and a tool round with its thought signature goes through it. Every cache made is deleted at the end. Four model calls,
// a little of the owner's Vertex credit. Skipped without it.
import { readFileSync } from "node:fs";
// The one agent's real tools: integrations doesn't depend on contracts, so this test alone reads contracts' source.
import { oneToolSchemas } from "../../../contracts/src/ai/index.js";
import { afterAll, describe, expect, it } from "vitest";
import { createOpenRouterModel, serviceAccountToken, type AiRequest, type AiResult } from "../../src/ai/index.js";
import { createMemoryLogger } from "../../src/logging/index.js";
import { aiToolOf } from "../../src/tool-agent/messages.js";

const file = process.env.VERTEX_SA_FILE ?? "";
// The project comes from the key file itself, so no project name is typed here.
const projectOf = (path: string): string => {
  const parsed: unknown = path === "" ? null : JSON.parse(readFileSync(path, "utf8"));
  return typeof parsed === "object" &&
    parsed !== null &&
    "project_id" in parsed &&
    typeof parsed.project_id === "string"
    ? parsed.project_id
    : "";
};
const baseUrl =
  process.env.VERTEX_BASE_URL ??
  `https://aiplatform.googleapis.com/v1/projects/${projectOf(file)}/locations/global/endpoints/openapi`;
const model = process.env.VERTEX_MODEL ?? "google/gemini-3.5-flash-lite";

/** An agency's prompt as long as a real one: its trips, then house rules enough to pass the cache's 20k characters. */
const system = [
  "You are the WhatsApp sales agent of Himalaya Treks. Answer briefly, in the customer's own language.",
  "Trips: T1 Kedarkantha Trek (Uttarakhand, 6 days, from Dehradun, every Friday). T2 Hampta Pass Trek (Himachal, 5 days, from Manali, every Saturday).",
  "Never say a price you haven't been given: when a customer names a trip, a date and how many travel, call quote first.",
  ...Array.from(
    { length: 200 },
    (_, n) =>
      `House rule ${String(n + 1)}: be warm and exact, and promise nothing the tools or the trips above don't say.`,
  ),
].join("\n");
const tools = oneToolSchemas({ tripLabels: ["T1", "T2"], brochureLabels: ["B1"], voiceNotes: ["m1"] }).map(aiToolOf);
const ask: AiRequest = {
  feature: "sales_agent",
  messages: [
    { role: "system", content: system },
    { role: "user", content: "Kedarkantha 2026-12-18 ko 2 adults, kitna hoga?" },
  ],
  tools,
  toolChoice: "auto",
  maxTokens: 2000,
  temperature: 0,
  reasoning: { effort: "low" },
  timeoutMs: 60_000,
};
const callOf = (result: AiResult) => {
  const call = result.ok ? result.toolCalls?.[0] : undefined;
  if (call === undefined) throw new Error("expected a tool call");
  return call;
};

describe.skipIf(file === "")("Vertex AI's context cache (live)", () => {
  // Read when a test runs: a skipped suite still collects, and has no file to read.
  let minted: (() => Promise<string>) | undefined;
  const token = () =>
    (minted ??= serviceAccountToken(
      JSON.parse(readFileSync(file, "utf8")) as { client_email: string; private_key: string },
      createMemoryLogger(),
    ))();
  // Every cache the adapter makes, by the name Vertex gave it, to delete at the end.
  const made: string[] = [];
  const recording: typeof fetch = async (url, init) => {
    const response = await fetch(url, init);
    if (typeof url === "string" && url.endsWith("/cachedContents") && response.ok) {
      const { name } = (await response.clone().json()) as { name?: string };
      if (name !== undefined) made.push(name);
    }
    return response;
  };
  afterAll(async () => {
    for (const name of made) {
      const gone = await fetch(`${new URL(baseUrl).origin}/v1/${name}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${await token()}` },
      });
      expect(gone.status).toBe(200);
    }
  });

  it(
    "makes the same tool call through the cache, reads it, and finishes a signed tool round",
    { timeout: 240_000 },
    async () => {
      // Today's request, uncached: a token as a plain key leaves the cache out.
      const uncached = createOpenRouterModel({ apiKey: await token(), models: { sales_agent: [model] }, baseUrl });
      const cached = createOpenRouterModel({
        apiKey: token,
        models: { sales_agent: [model] },
        baseUrl,
        fetch: recording,
      });
      const today = callOf(await uncached.complete(ask));
      const first = await cached.complete(ask);
      const second = await cached.complete(ask);
      expect(made).toHaveLength(1);
      for (const result of [first, second]) {
        const call = callOf(result);
        expect(call.name).toBe(today.name);
        expect(JSON.parse(call.arguments)).toEqual(JSON.parse(today.arguments));
      }
      expect(second.ok ? second.cachedTokens : 0).toBeGreaterThan(0);

      // The round: the call goes back with its thought signature, its result after it, through the same cache.
      const call = callOf(second);
      expect(call.providerData).toEqual({
        extra_content: { google: { thought_signature: expect.any(String) as string } },
      });
      const answer = await cached.complete({
        ...ask,
        messages: [
          ...ask.messages,
          { role: "assistant", content: second.ok ? second.text : "", toolCalls: [call] },
          {
            role: "tool",
            content: "T1 Kedarkantha Trek, 18 Dec 2026, 2 adults: ₹18,998 in all, ₹4,000 advance.",
            toolCallId: call.id,
          },
        ],
      });
      expect(answer).toMatchObject({ ok: true });
      expect(answer.ok ? answer.cachedTokens : 0).toBeGreaterThan(0);
      expect(answer.ok ? answer.text : "").toMatch(/18,?998/);
      expect(made).toHaveLength(1);
    },
  );
});
