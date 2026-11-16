// The AI model with every call traced: one model-call observation per call, named for its feature (and its answer's schema,
// so the agent's two calls tell apart), with the messages sent, the answer, the model that gave it and its tokens, or ERROR
// and the reason. The call is untouched: the request reaches the model as it came and the result comes back as it was
// given, extra fields included (the tool-calling agent adds its own), whatever happens to the tracing.
import { failureOf, type AiTracing, type GenerationEnd, type TracedGeneration } from "../tracing/ai-tracing.js";
import type { AiMessage, AiModel, AiPart, AiRequest } from "./ai-model.js";

/** An image or a recording, as the trace shows it: what it was and how big, never its bytes. */
function placeholderOf(part: AiPart): string {
  const size = `${String(Math.max(1, Math.round(part.bytes.byteLength / 1024)))} KB`;
  return part.type === "image" ? `[image ${part.mimeType}, ${size}]` : `[audio ${part.format}, ${size}]`;
}

/** A message as the trace shows it: words alone stay a string; with attachments, parts as the model got them. */
function tracedMessage(message: AiMessage): { role: AiMessage["role"]; content: unknown } {
  if (message.attachments === undefined || message.attachments.length === 0) {
    return { role: message.role, content: message.content };
  }
  return {
    role: message.role,
    content: [
      { type: "text", text: message.content },
      ...message.attachments.map((part) => ({ type: "text", text: placeholderOf(part) })),
    ],
  };
}

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
        ...(request.schema === undefined ? {} : { jsonSchema: request.schema.jsonSchema }),
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
                output: result.text,
                model: result.model,
                usage: { input: result.inputTokens, output: result.outputTokens },
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
