// The tool-agent tests' messages and tool: one of each role, an answer with calls (one with broken JSON) and Gemini's
// reasoning details, and a tool whose schema carries examples and a property named "examples".
import { z } from "zod";
import type { AiMessage } from "../../src/ai/index.js";
import type { ToolAgentInput } from "../../src/tool-agent/index.js";

export const system: AiMessage = { role: "system", content: "You answer for Himalaya Treks." };
export const user: AiMessage = { role: "user", content: "Kedarkantha kitne ka hai?" };
export const userWithAttachment: AiMessage = {
  role: "user",
  content: "Is photo wala trek?",
  attachments: [
    { type: "image", mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) },
    { type: "audio", format: "wav", bytes: new Uint8Array([4, 5]) },
  ],
};
/** Gemini's thought signature as OpenRouter returns it. */
export const signature = [
  { type: "reasoning.encrypted", data: "c2lnLTE=", id: "tool_0", format: "google-gemini-v1", index: 0 },
];
export const assistantWithCalls: AiMessage = {
  role: "assistant",
  content: "Let me check.",
  toolCalls: [
    { id: "call_1", name: "get_trip", arguments: '{"trip_id":"T1",}' },
    { id: "call_2", name: "quote", arguments: '{"trip_id":"T1","adults":2}' },
  ],
  reasoningDetails: signature,
};
/** Gemini's thought signature as Vertex AI and Gemini's own endpoint return it: on the call itself, no reasoning details. */
export const callSignature = { extra_content: { google: { thought_signature: "c2lnLXY=" } } };
export const assistantWithSignedCalls: AiMessage = {
  role: "assistant",
  content: "",
  toolCalls: [
    { id: "call_v1", name: "get_trip", arguments: '{"trip_id":"T1"}', providerData: callSignature },
    { id: "call_v2", name: "quote", arguments: '{"trip_id":"T1","adults":2}' },
  ],
};
export const assistant: AiMessage = { role: "assistant", content: "Kedarkantha is ₹9,499 per person." };
export const toolResult: AiMessage = { role: "tool", content: "Kedarkantha, 6 days", toolCallId: "call_1" };

export const getTrip = {
  name: "get_trip",
  description: "One trip's dates, price and what it includes.",
  schema: z
    .strictObject({
      trip_id: z
        .enum(["T1", "T2"])
        .describe("The trip's id.")
        .meta({ examples: ["T1"] }),
      adults: z.number().int().min(1).optional(),
      examples: z.array(z.string()).optional(),
    })
    .meta({ examples: [{ trip_id: "T1" }] }),
};
/** getTrip's schema as the model reads it. */
export const getTripParameters = {
  type: "object",
  properties: {
    trip_id: { type: "string", enum: ["T1", "T2"], description: "The trip's id." },
    adults: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    examples: { type: "array", items: { type: "string" } },
  },
  required: ["trip_id"],
  additionalProperties: false,
};

/** The one agent's settings (the plan's Global Constraints). */
export const request: ToolAgentInput["request"] = {
  feature: "sales_agent",
  maxTokens: 8_000,
  reasoning: { effort: "low" },
  timeoutMs: 60_000,
  user: "org-1",
};
