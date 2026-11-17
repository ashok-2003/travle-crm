// A live check, run by the owner: a real WhatsApp voice note (VOICE_NOTE_FILE, OGG/Opus) sent to the agent's first model
// through OpenRouter, to learn whether OpenRouter takes it. The model is the first of AI_AGENT_MODELS, as in production.
// Skipped without OPENROUTER_API_KEY, VOICE_NOTE_FILE and AI_AGENT_MODELS.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createOpenRouterModel } from "../../src/ai/index.js";

const apiKey = process.env.OPENROUTER_API_KEY ?? "";
const file = process.env.VOICE_NOTE_FILE ?? "";
// Split as the api's modelList does: comma-separated, trimmed, blanks dropped.
const firstModel =
  (process.env.AI_AGENT_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .find((model) => model !== "") ?? "";

describe.skipIf(apiKey === "" || file === "" || firstModel === "")("a real voice note (live)", () => {
  it("transcribes a real WhatsApp voice note on the first agent model", async () => {
    const model = createOpenRouterModel({ apiKey, models: { sales_agent: [firstModel] } });
    const result = await model.complete({
      feature: "sales_agent",
      messages: [
        {
          role: "user",
          content: "Write down exactly what is said in this voice note, in the language spoken.",
          attachments: [{ type: "audio", format: "ogg", bytes: new Uint8Array(readFileSync(file)) }],
        },
      ],
      maxTokens: 2000,
      timeoutMs: 60_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.trim().length).toBeGreaterThan(0);
  });
});
