// The tool-agent port (ruling R2, ADR 0008): one run of a model that calls tools until it answers in words. The domain
// hands over plain functions and our own messages and gets back the reply and the transcript; LangGraph and LangChain
// stay behind this port, in this package. Domain code imports these types only.
import type { z } from "zod";
import type { AiFailure, AiMessage, AiRequest, AiResult } from "../ai/ai-model.js";

export interface AgentTool {
  name: string;
  description: string;
  /** Describes the arguments to the model (JSON Schema, io "input"). The adapter checks only that they are an object. */
  schema: z.ZodType<Record<string, unknown>>;
  /**
   * Runs on the model's arguments, which it checks itself, refusing in the domain's own words (the lead's ruling);
   * `words` are the words of the answer that made the call.
   */
  run(args: Record<string, unknown>, call: { words: string }): Promise<string>;
  /** Once a call to this tool goes through (its result isn't a refusal) the run ends: the model isn't asked again. */
  endsRun?: boolean;
}

/** One tool call as it went: its name, the model's own argument text, and the result the model read. */
export interface AgentToolEntry {
  name: string;
  arguments: string;
  result: string;
}

/** One model call as the caller counts it: "limit" when the month has none left. */
export type AgentModelCall = (request: AiRequest) => Promise<AiResult | { ok: false; reason: "limit" }>;

export interface ToolAgentInput {
  /** The system message first. */
  messages: readonly AiMessage[];
  tools: readonly AgentTool[];
  /** Every call's request but its messages and tools: feature, maxTokens, reasoning, timeoutMs, user, model, temperature. */
  request: Omit<AiRequest, "messages" | "tools" | "toolChoice">;
  call: AgentModelCall;
  /** Asked before each model call; true ends the run `superseded`. */
  superseded?: () => Promise<boolean>;
  /** Told of every tool call, a refused one included, in order. */
  onTool?: (entry: AgentToolEntry) => void;
  recursionLimit?: number;
}

export type ToolAgentEnd =
  | { end: "answered"; text: string; model: string; transcript: AiMessage[]; calls: number }
  | { end: "steps"; calls: number }
  | { end: "model_failed"; reason: AiFailure | "limit"; calls: number }
  | { end: "superseded"; calls: number };

export interface ToolAgent {
  run(input: ToolAgentInput): Promise<ToolAgentEnd>;
}
