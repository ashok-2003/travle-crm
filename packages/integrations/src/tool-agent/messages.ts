// Our port's chat messages as LangChain's and back, and a tool as the model reads it. The conversion keeps all the next
// request needs: an assistant's raw tool calls (the model's own argument text, broken JSON included, and each call's own
// provider data) and its reasoning details, sent back unchanged because Gemini refuses a tool round without its thought
// signatures (a 400): OpenRouter returns them as reasoning details, Vertex AI on the call itself.
import type { BindToolsInput } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type AIMessageFields,
  type BaseMessage,
  type ToolCall,
} from "@langchain/core/messages";
import { z } from "zod";
import type { AiMessage, AiPart, AiTool, AiToolCall } from "../ai/ai-model.js";
import type { AgentTool } from "./tool-agent.js";

/**
 * A call as the model made it, in OpenAI's shape: LangChain deprecates keeping these beside its parsed calls, but only
 * these hold the model's own argument text, which goes back to the model unchanged.
 */
interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** The port's `providerData` (Gemini's thought signature on Vertex AI), kept as it is for the next request. */
  providerData?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRawToolCall = (value: unknown): value is RawToolCall =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isRecord(value.function) &&
  typeof value.function.name === "string" &&
  typeof value.function.arguments === "string" &&
  (value.providerData === undefined || isRecord(value.providerData));

/** The object an argument text holds, for LangGraph's routing; {} for anything else (the tool runner refuses the text). */
function argumentsObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : {};
  } catch {
    return {};
  }
}

/**
 * An assistant message as LangChain's fields: the calls parsed for LangGraph's routing, and the raw calls (OpenAI's shape),
 * the reasoning details and the model that wrote it kept in `additional_kwargs`, which is what goes back to the model.
 */
export function assistantFields(message: AiMessage): AIMessageFields {
  const calls = message.toolCalls;
  return {
    content: message.content,
    tool_calls: (calls ?? []).map((call): ToolCall => ({
      type: "tool_call",
      id: call.id,
      name: call.name,
      args: argumentsObject(call.arguments),
    })),
    additional_kwargs: {
      ...(calls === undefined
        ? {}
        : {
            tool_calls: calls.map((call): RawToolCall => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
              ...(call.providerData === undefined ? {} : { providerData: call.providerData }),
            })),
          }),
      ...(message.reasoningDetails === undefined ? {} : { reasoning_details: message.reasoningDetails }),
      ...(message.model === undefined ? {} : { model: message.model }),
    },
  };
}

export function toLangChain(message: AiMessage): BaseMessage {
  switch (message.role) {
    case "system":
      return new SystemMessage({ content: message.content });
    case "user":
      return new HumanMessage({
        content: message.content,
        // For the media pull request: kept as they are, for the next request.
        additional_kwargs: message.attachments === undefined ? {} : { attachments: message.attachments },
      });
    case "assistant":
      return new AIMessage(assistantFields(message));
    case "tool":
      return new ToolMessage({ content: message.content, tool_call_id: message.toolCallId ?? "" });
  }
}

/** A message's words: its text, or the text of its text blocks when LangChain holds it as blocks. */
const wordsOf = (message: BaseMessage): string =>
  typeof message.content === "string" ? message.content : message.text;

/** An answer's calls: the raw ones we kept, else (a message LangChain built itself) its parsed calls as JSON. */
function toolCallsOf(message: AIMessage): AiToolCall[] | undefined {
  const kept: Record<string, unknown> = message.additional_kwargs;
  const raw = kept.tool_calls;
  if (Array.isArray(raw) && raw.every(isRawToolCall)) {
    return raw.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
      ...(call.providerData === undefined ? {} : { providerData: call.providerData }),
    }));
  }
  const parsed = message.tool_calls ?? [];
  if (parsed.length === 0) return undefined;
  return parsed.map((call) => ({ id: call.id ?? "", name: call.name, arguments: JSON.stringify(call.args) }));
}

export function fromLangChain(message: BaseMessage): AiMessage {
  const content = wordsOf(message);
  if (SystemMessage.isInstance(message)) return { role: "system", content };
  if (HumanMessage.isInstance(message)) {
    // Only toLangChain writes them, from an AiMessage's own.
    const attachments = message.additional_kwargs.attachments as readonly AiPart[] | undefined;
    return { role: "user", content, ...(attachments === undefined ? {} : { attachments }) };
  }
  if (AIMessage.isInstance(message)) {
    const toolCalls = toolCallsOf(message);
    const { reasoning_details: reasoningDetails, model } = message.additional_kwargs;
    return {
      role: "assistant",
      content,
      ...(toolCalls === undefined ? {} : { toolCalls }),
      ...(reasoningDetails === undefined ? {} : { reasoningDetails }),
      ...(typeof model === "string" ? { model } : {}),
    };
  }
  if (ToolMessage.isInstance(message)) return { role: "tool", content, toolCallId: message.tool_call_id };
  throw new Error(`A ${message.type} message has no role in the AI port`);
}

/** JSON Schema keywords whose value is a schema or a list of schemas (2020-12, and draft 7's list of items). */
const SCHEMA_KEYWORDS = new Set([
  "items",
  "prefixItems",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "anyOf",
  "oneOf",
  "allOf",
  "contentSchema",
]);
/** Keywords whose value maps names to schemas: a property named "examples" is kept, only the keyword goes. */
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties", "dependentSchemas", "$defs", "definitions"]);

function schemaWithoutExamples(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaWithoutExamples);
  return isRecord(value) ? withoutExamples(value) : value;
}

function withoutExamples(schema: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "examples") continue;
    if (SCHEMA_KEYWORDS.has(key)) kept[key] = schemaWithoutExamples(value);
    else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      kept[key] = Object.fromEntries(
        Object.entries(value).map(([name, inner]) => [name, schemaWithoutExamples(inner)]),
      );
    } else kept[key] = value;
  }
  return kept;
}

/**
 * The tool as the model reads it: the JSON Schema of what it takes (io "input", so a default makes a field optional),
 * without `$schema` or any `examples`, which a function's parameters don't carry.
 */
export function aiToolOf(tool: Pick<AgentTool, "name" | "description" | "schema">): AiTool {
  const parameters = withoutExamples(z.toJSONSchema(tool.schema, { io: "input" }));
  delete parameters.$schema;
  return { name: tool.name, description: tool.description, parameters };
}

/**
 * A tool handed to `bindTools`, as our port sends it: our own `AiTool`, or an OpenAI function definition. Anything else
 * (a LangChain tool with a zod schema) is refused: `aiToolOf` alone decides how a schema reads to the model.
 */
export function boundTool(tool: BindToolsInput): AiTool {
  const given: unknown = tool;
  const definition = isRecord(given) && given.type === "function" ? given.function : given;
  if (isRecord(definition) && typeof definition.name === "string" && isRecord(definition.parameters)) {
    const description = typeof definition.description === "string" ? definition.description : "";
    return { name: definition.name, description, parameters: definition.parameters };
  }
  throw new Error("bindTools takes our AiTool or an OpenAI function definition");
}
