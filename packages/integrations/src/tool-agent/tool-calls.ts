// What both tool agents share: the tool-call runner, the model's next answer, and the ends. An answer's calls run one
// after another, in the model's order (each tool opens its own transaction and stages in order, so never in parallel),
// and a call that can't run is answered with a refusal the model reads and goes on from. The runner checks only that the
// arguments are a JSON object: a tool checks them itself and refuses in the domain's own words, which the model
// understands better than zod's (the lead's ruling).
import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { AiToolCall } from "../ai/ai-model.js";
import { AgentModelFailure, PortChatModel } from "./chat-model.js";
import { aiToolOf, fromLangChain } from "./messages.js";
import type { AgentTool, AgentToolEntry, ToolAgentEnd, ToolAgentInput } from "./tool-agent.js";

const FAILED = "refused: that couldn't be done just now; say you'll check and come back, and call create_task";

/**
 * LangChain's switches that send every chat to LangSmith, or print it to the logs past our Logger's censoring (review
 * I1). LangChain reads them on every call, so each run removes them first. They are never put back: runs overlap, and
 * one ending would turn them on under another.
 */
const LANGCHAIN_LOGGING = [
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_VERBOSE",
];

/** The customer wrote again: the run ends before its next model call. */
class Superseded extends Error {}

/** The call's arguments as an object, or the refusal the model reads instead. Empty text reads as `{}`. */
function argumentsOf(text: string): Record<string, unknown> | string {
  if (text.trim() === "") return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "refused: the arguments weren't JSON";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "refused: the arguments weren't a JSON object";
  }
  return { ...value };
}

async function resultOf(tools: readonly AgentTool[], call: AiToolCall, words: string): Promise<string> {
  const tool = tools.find((each) => each.name === call.name);
  if (tool === undefined) return `refused: there is no tool called ${call.name}`;
  const args = argumentsOf(call.arguments);
  if (typeof args === "string") return args;
  try {
    return await tool.run(args, { words });
  } catch {
    return FAILED;
  }
}

/** Runs the answer's calls one after another, in its order; each result a string for a tool message. */
export async function runToolCalls(
  tools: readonly AgentTool[],
  calls: readonly AiToolCall[],
  words: string,
  onTool?: (entry: AgentToolEntry) => void,
): Promise<{ toolCallId: string; content: string }[]> {
  const results: { toolCallId: string; content: string }[] = [];
  for (const call of calls) {
    const result = await resultOf(tools, call, words);
    onTool?.({ name: call.name, arguments: call.arguments, result });
    results.push({ toolCallId: call.id, content: result });
  }
  return results;
}

/** A run's model, one per run (it pins the first answer's model and counts the calls), with LangChain kept quiet. */
export function modelForRun(input: ToolAgentInput): PortChatModel {
  for (const name of LANGCHAIN_LOGGING) Reflect.deleteProperty(process.env, name);
  return new PortChatModel({ call: input.call, request: input.request }).bindTools(input.tools.map(aiToolOf));
}

/** The model's next answer, unless the customer wrote again (which ends the run `superseded`). */
export async function nextAnswer(model: PortChatModel, input: ToolAgentInput, messages: BaseMessage[]) {
  if ((await input.superseded?.()) === true) throw new Superseded();
  return model.invoke(messages);
}

/** The calls an answer made, as the model sent them (its own argument text). */
export const callsOf = (answer: BaseMessage | undefined): readonly AiToolCall[] =>
  answer === undefined ? [] : (fromLangChain(answer).toolCalls ?? []);

/** The tool messages answering an answer's calls, run with its words. */
export async function toolMessages(input: ToolAgentInput, answer: BaseMessage | undefined): Promise<ToolMessage[]> {
  const words = answer === undefined ? "" : fromLangChain(answer).content;
  const results = await runToolCalls(input.tools, callsOf(answer), words, input.onTool);
  return results.map((result) => new ToolMessage({ content: result.content, tool_call_id: result.toolCallId }));
}

/** True when the last tool step holds a call of an `endsRun` tool that went through (its result isn't a refusal). */
export function endsRun(input: ToolAgentInput, messages: readonly BaseMessage[]): boolean {
  const answerAt = messages.findLastIndex((message) => message.type === "ai");
  const answer = messages[answerAt];
  const results = new Map(
    messages
      .slice(answerAt + 1)
      .flatMap((message) => (ToolMessage.isInstance(message) ? [[message.tool_call_id, message.text]] : [])),
  );
  return callsOf(answer).some(
    (call) =>
      input.tools.some((tool) => tool.name === call.name && tool.endsRun === true) &&
      results.get(call.id)?.startsWith("refused:") === false,
  );
}

/** The run's end: the last answer's text and model (not a tool message's), and every message. */
export function answered(messages: readonly BaseMessage[], calls: number): ToolAgentEnd {
  const transcript = messages.map(fromLangChain);
  const answer = messages.findLast((message) => message.type === "ai");
  const model: unknown = answer?.response_metadata.model;
  const text = answer === undefined ? "" : fromLangChain(answer).content;
  return { end: "answered", text, model: typeof model === "string" ? model : "", transcript, calls };
}

/** The run's end for a failed model call or a newer customer line; anything else is thrown on. */
export function failed(error: unknown, calls: number): ToolAgentEnd {
  if (error instanceof AgentModelFailure) return { end: "model_failed", reason: error.reason, calls };
  if (error instanceof Superseded) return { end: "superseded", calls };
  throw error;
}
