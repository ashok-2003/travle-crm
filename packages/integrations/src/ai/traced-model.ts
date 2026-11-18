// The AI model with every call traced: one model-call observation per call, named for its feature (and its answer's schema,
// so the agent's two calls tell apart), with the messages sent, the answer, the model that gave it and its tokens (cached
// input apart, as Langfuse prices it), or ERROR and the reason; a tool round shows its calls in OpenAI's shape, which
// Langfuse reads. The call is untouched: the request reaches the model as it came and the result comes back as it was
// given, extra fields included, whatever happens to the tracing.
import { failureOf, type AiTracing, type GenerationEnd, type TracedGeneration } from "../tracing/ai-tracing.js";
import type { AiMessage, AiModel, AiPart, AiRequest, AiToolCall } from "./ai-model.js";

/** An image or a recording, as the trace shows it: what it was and how big, never its bytes. */
function placeholderOf(part: AiPart): string {
  const size = `${String(Math.max(1, Math.round(part.bytes.byteLength / 1024)))} KB`;
  return part.type === "image" ? `[image ${part.mimeType}, ${size}]` : `[audio ${part.format}, ${size}]`;
}

/** Tool calls as OpenAI writes them, its arguments the JSON text the model sent. */
const tracedToolCalls = (calls: readonly AiToolCall[]) =>
  calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } }));

/**
 * A message as the trace shows it: words alone stay a string; with attachments, parts as the model got them; an assistant's
 * tool calls and a tool result's call id as OpenAI names them. Reasoning details are the provider's, opaque: never shown.
 */
function tracedMessage(message: AiMessage): Record<string, unknown> {
  const tools = {
    ...(message.toolCalls === undefined || message.toolCalls.length === 0
      ? {}
      : { tool_calls: tracedToolCalls(message.toolCalls) }),
    ...(message.toolCallId === undefined ? {} : { tool_call_id: message.toolCallId }),
  };
  if (message.attachments === undefined || message.attachments.length === 0) {
    return { role: message.role, content: message.content, ...tools };
  }
  return {
    role: message.role,
    content: [
      { type: "text", text: message.content },
      ...message.attachments.map((part) => ({ type: "text", text: placeholderOf(part) })),
    ],
    ...tools,
  };
}

/** An answer as the trace shows it: its words, or, with tool calls, the assistant's message that holds them. */
const tracedAnswer = (text: string, toolCalls: readonly AiToolCall[] | undefined): unknown =>
  toolCalls === undefined || toolCalls.length === 0
    ? text
    : { role: "assistant", content: text, tool_calls: tracedToolCalls(toolCalls) };

/** Stable names: the feature, and the answer's schema when there is one ("ai.autopilot.understand_form"). */
function nameOf(request: AiRequest): string {
  const schema = request.schema?.name;
  return schema !== undefined && /^[\w-]{1,40}$/.test(schema)
    ? `ai.${request.feature}.${schema}`
    : `ai.${request.feature}`;
}

function startCall(tracing: AiTracing, request: AiRequest): TracedGeneration {
  const modelParameters = {
    ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  };
  try {
    return tracing.generation({
      name: nameOf(request),
      input: request.messages.map(tracedMessage),
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(Object.keys(modelParameters).length === 0 ? {} : { modelParameters }),
      metadata: {
        feature: request.feature,
        ...(request.user === undefined ? {} : { organizationId: request.user }),
        json: request.json === true || request.schema !== undefined,
        schema: request.schema?.name ?? null,
      },
    });
  } catch {
    return { end: () => undefined };
  }
}

function endCall(call: TracedGeneration, result: GenerationEnd): void {
  try {
    call.end(result);
  } catch {
    // The trace loses the call's end; the call's result stands.
  }
}

export function withTracing(model: AiModel, tracing: AiTracing): AiModel {
  return {
    configured: model.configured,
    async complete(request) {
      const call = startCall(tracing, request);
      try {
        const result = await model.complete(request);
        endCall(
          call,
          result.ok
            ? {
                output: tracedAnswer(result.text, result.toolCalls),
                model: result.model,
                // Cached input apart, under the key Langfuse prices at a tenth: the rest is input at its full price.
                usage: {
                  input: Math.max(0, result.inputTokens - (result.cachedTokens ?? 0)),
                  output: result.outputTokens,
                  ...((result.cachedTokens ?? 0) > 0 ? { input_cached_tokens: result.cachedTokens } : {}),
                },
              }
            : { level: "ERROR", statusMessage: result.reason },
        );
        return result;
      } catch (error) {
        endCall(call, { level: "ERROR", statusMessage: failureOf(error) });
        throw error;
      }
    },
  };
}
