// Gemini on Vertex AI (ruling R14), live, with the service account whose key file VERTEX_SA_FILE names (its path only:
// the key is read here and never printed). The LangGraph agent finishes two dependent tool rounds, which Gemini refuses
// (a 400) unless each call's thought signature goes back; and a WhatsApp-style OGG/Opus voice note sent as `input_audio`.
// Each call spends a little of the owner's Vertex credit: four model calls in all. Skipped without it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterModel, serviceAccountToken, type AiRequest } from "../../src/ai/index.js";
import { createMemoryLogger } from "../../src/logging/index.js";
import { createLangGraphToolAgent, type AgentToolEntry } from "../../src/tool-agent/index.js";
import { request } from "../tool-agent/fixtures.js";

const file = process.env.VERTEX_SA_FILE ?? "";
const baseUrl =
  process.env.VERTEX_BASE_URL ??
  "https://aiplatform.googleapis.com/v1/projects/veeper-ai/locations/global/endpoints/openapi";
const model = process.env.VERTEX_MODEL ?? "google/gemini-3.5-flash-lite";

describe.skipIf(file === "")("Gemini on Vertex AI (live)", () => {
  const vertex = () =>
    createOpenRouterModel({
      apiKey: serviceAccountToken(
        JSON.parse(readFileSync(file, "utf8")) as { client_email: string; private_key: string },
        createMemoryLogger(),
      ),
      models: { sales_agent: [model] },
      baseUrl,
    });

  it("finishes two dependent tool rounds on the LangGraph agent", { timeout: 180_000 }, async () => {
    const ai = vertex();
    const sent: AiRequest[] = [];
    const entries: AgentToolEntry[] = [];
    const end = await createLangGraphToolAgent().run({
      messages: [
        {
          role: "system",
          content:
            "You answer for Himalaya Treks. To give a price, first find the trek's id with find_trek, then call get_price with that id.",
        },
        { role: "user", content: "How much is the Kedarkantha trek per person?" },
      ],
      tools: [
        {
          name: "find_trek",
          description: "A trek's id, from its name.",
          schema: z.strictObject({ name: z.string().describe("The trek's name.") }),
          run: () => Promise.resolve("Kedarkantha's id is TRK-42"),
        },
        {
          name: "get_price",
          description: "A trek's price per person, in rupees, from its id (find_trek gives it).",
          schema: z.strictObject({ trek_id: z.string() }),
          run: (args) => Promise.resolve(args.trek_id === "TRK-42" ? "₹9,499 per person" : "No such trek id"),
        },
      ],
      request,
      call: (asked) => {
        sent.push(asked);
        return ai.complete(asked);
      },
      onTool: (entry) => entries.push(entry),
    });
    // The name Vertex answers with is the one natural and the one agent pin later calls to: it must be askable again.
    expect(end).toMatchObject({ end: "answered", model });
    expect(entries.map((entry) => entry.name)).toEqual(["find_trek", "get_price"]);
    expect(end.end === "answered" ? end.text : "").toMatch(/9,?499/);
    // Vertex signs the calls on the call itself, and every later request sent each signature back.
    const signed = (sent.at(-1)?.messages ?? []).flatMap((message) => message.toolCalls ?? []);
    expect(signed.map((call) => call.providerData)).toEqual([
      { extra_content: { google: { thought_signature: expect.any(String) as string } } },
      { extra_content: { google: { thought_signature: expect.any(String) as string } } },
    ]);
  });

  // Vertex reads input_audio's format as a MIME type: a short "ogg" was a 400 (2026-11-17), "audio/ogg" transcribes.
  it("transcribes an OGG/Opus voice note sent as input_audio", { timeout: 60_000 }, async () => {
    const result = await vertex().complete({
      feature: "sales_agent",
      messages: [
        {
          role: "user",
          content: "Write down exactly what is said in this voice note, in the language spoken.",
          attachments: [
            {
              type: "audio",
              format: "ogg",
              bytes: new Uint8Array(readFileSync(new URL("fixtures/voice-note.ogg", import.meta.url))),
            },
          ],
        },
      ],
      maxTokens: 2000,
      // As production reads a voice note (media.ts): Vertex receives reasoning_effort "minimal".
      reasoning: { effort: "minimal" },
      timeoutMs: 60_000,
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.ok ? result.text : "").toMatch(/december/i);
  });
});
