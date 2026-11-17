// The owner's step 0 (spec 4.3), live: a two-round tool turn on the LangGraph agent over our OpenRouter adapter and the
// first agent model, as in production. Gemini 3 refuses the second round (a 400) unless the first answer's thought
// signatures go back with it. Skipped without OPENROUTER_API_KEY and AI_AGENT_MODELS.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenRouterModel } from "../../src/ai/index.js";
import { createLangGraphToolAgent, type AgentToolEntry } from "../../src/tool-agent/index.js";
import { request } from "./fixtures.js";

const apiKey = process.env.OPENROUTER_API_KEY ?? "";
// Split as the api's modelList does: comma-separated, trimmed, blanks dropped.
const firstModel =
  (process.env.AI_AGENT_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .find((model) => model !== "") ?? "";

describe.skipIf(apiKey === "" || firstModel === "")("the LangGraph tool agent on OpenRouter (live)", () => {
  it("finishes a two-round tool turn on the first agent model", { timeout: 180_000 }, async () => {
    const ai = createOpenRouterModel({ apiKey, models: { sales_agent: [firstModel] } });
    const entries: AgentToolEntry[] = [];
    const end = await createLangGraphToolAgent().run({
      messages: [
        {
          role: "system",
          content: "You answer for Himalaya Treks. Look a price up with get_price before you give it.",
        },
        { role: "user", content: "How much is the Kedarkantha trek per person?" },
      ],
      tools: [
        {
          name: "get_price",
          description: "A trek's price per person, in rupees.",
          schema: z.strictObject({ trek: z.string().describe("The trek's name.") }),
          run: () => Promise.resolve("Kedarkantha: ₹9,499 per person"),
        },
      ],
      request,
      call: (sent) => ai.complete(sent),
      onTool: (entry) => entries.push(entry),
    });
    expect(end).toMatchObject({ end: "answered" });
    expect(entries.map((entry) => entry.name)).toContain("get_price");
    expect(end.end === "answered" ? end.text : "").toMatch(/9,?499/);
  });
});
