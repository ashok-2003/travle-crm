// The Responses API (Azure AI Foundry's, the owner, 2026-11-25) for the WhatsApp agent's turns on a reasoning model: the
// one call that also returns what the model thought, as a short summary for the trace, where Chat Completions returns
// only a count. This file builds the request from our messages and reads the reply in Chat Completions' shape, so the
// adapter (openrouter.ts) answers, retries and falls back exactly as it does there. Nothing is kept at the provider
// (`store: false`), and the model's reasoning is not sent back on the next tool round, as on Chat Completions. Tools stay
// non-strict, as on Chat Completions (Responses would try strict mode unless told).
import type { AiEffort, AiMessage, AiRequest } from "./ai-model.js";

/** Whether the request goes by Responses: the agent's turn, holding nothing it is not built for here (a recording, JSON). */
export function usesResponses(request: AiRequest): boolean {
  return (
    request.feature === "sales_agent" &&
    request.json !== true &&
    request.schema === undefined &&
    !request.messages.some((message) => (message.attachments ?? []).some((part) => part.type === "audio"))
  );
}

/** Words alone stay a string; with images, Responses' input parts. */
function contentOf(message: AiMessage): unknown {
  const images = (message.attachments ?? []).flatMap((part) =>
    part.type === "image"
      ? [
          {
            type: "input_image",
            image_url: `data:${part.mimeType};base64,${Buffer.from(part.bytes).toString("base64")}`,
          },
        ]
      : [],
  );
  return images.length === 0 ? message.content : [{ type: "input_text", text: message.content }, ...images];
}

/** A message as Responses' input items: an assistant's words and each of its calls apart, a tool result by its call. */
function inputItems(message: AiMessage): object[] {
  if (message.role === "tool") {
    return [{ type: "function_call_output", call_id: message.toolCallId ?? "", output: message.content }];
  }
  if (message.role !== "assistant") return [{ role: message.role, content: contentOf(message) }];
  return [
    ...(message.content === "" ? [] : [{ role: "assistant", content: message.content }]),
    ...(message.toolCalls ?? []).map((call) => ({
      type: "function_call",
      call_id: call.id,
      name: call.name,
      arguments: call.arguments,
    })),
  ];
}

/** The request's body: the reasoning model's own effort, room and prompt cache key, as the adapter works them out. */
export function responsesBody(
  request: AiRequest,
  model: string,
  settings: { effort: AiEffort; maxOutputTokens: number; promptCacheKey: string },
): object {
  const tools = request.tools ?? [];
  return {
    model,
    input: request.messages.flatMap(inputItems),
    ...(tools.length === 0
      ? {}
      : {
          tools: tools.map(({ name, description, parameters }) => ({
            type: "function",
            name,
            description,
            parameters,
            strict: false,
          })),
          ...(request.toolChoice === undefined ? {} : { tool_choice: request.toolChoice }),
        }),
    max_output_tokens: settings.maxOutputTokens,
    reasoning: { effort: settings.effort, summary: "auto" },
    store: false,
    prompt_cache_key: settings.promptCacheKey,
    ...(request.user === undefined ? {} : { user: request.user }),
  };
}

/** A Responses reply, as far as the adapter reads it. */
export interface ResponsesReply {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
    summary?: { type?: string; text?: string }[];
    call_id?: string;
    name?: string;
    arguments?: string;
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

/** The texts of one type of item's parts of one type: a message's words, a reasoning item's summary. */
const textsOf = (reply: ResponsesReply, item: string, parts: "content" | "summary", part: string): string[] =>
  (reply.output ?? [])
    .filter((each) => each.type === item)
    .flatMap((each) => each[parts] ?? [])
    .filter((each) => each.type === part)
    .map((each) => each.text ?? "");

/** Why it stopped, in Chat Completions' words: cut off at max_output_tokens is a length stop. */
function finishOf(reply: ResponsesReply, calls: number): string {
  if (reply.status === "incomplete") {
    const why = reply.incomplete_details?.reason;
    return why === "max_output_tokens" ? "length" : (why ?? "incomplete");
  }
  if (reply.status === undefined || reply.status === "completed") return calls > 0 ? "tool_calls" : "stop";
  return reply.status;
}

/** The reply in Chat Completions' shape, and its reasoning summary's parts joined with blank lines ("" for none). */
export function readResponses(reply: ResponsesReply) {
  const toolCalls = (reply.output ?? [])
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      id: item.call_id ?? "",
      type: "function",
      function: { name: item.name ?? "", arguments: item.arguments ?? "" },
    }));
  return {
    completion: {
      usage: {
        prompt_tokens: reply.usage?.input_tokens ?? 0,
        completion_tokens: reply.usage?.output_tokens ?? 0,
        prompt_tokens_details: { cached_tokens: reply.usage?.input_tokens_details?.cached_tokens ?? 0 },
        completion_tokens_details: { reasoning_tokens: reply.usage?.output_tokens_details?.reasoning_tokens ?? 0 },
      },
      choices: [
        {
          message: { content: textsOf(reply, "message", "content", "output_text").join(""), tool_calls: toolCalls },
          finish_reason: finishOf(reply, toolCalls.length),
        },
      ],
    },
    reasoningSummary: textsOf(reply, "reasoning", "summary", "summary_text")
      .filter((text) => text.trim() !== "")
      .join("\n\n"),
  };
}
