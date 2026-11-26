// The AI tracing port: each agent turn as one trace, its model calls nested inside, grouped by chat, so a person can read
// what the AI was given, what it answered and why the turn ended as it did. Adapters: Langfuse, none, and the in-memory one
// tests read. Tracing never changes what it traces: an adapter catches its own failures, and a work's result or error
// comes back exactly as the work gave it.
import { errorFields } from "../logging/error-fields.js";

/** How serious an observation is: a failed model call is ERROR, a turn that sent nothing for a bad reason WARNING. */
export type TraceLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

/** A prompt kept in Langfuse's prompt management, by its name and the version a turn ran. */
export interface TracedPrompt {
  name: string;
  version: number;
}

/** A turn as it starts. The name is stable and names the kind of turn, never one turn: "whatsapp-agent.reply". */
export interface TurnStart {
  name: string;
  /** Groups a chat's turns: the conversation's id, or a Try it chat's. At most 200 characters. */
  sessionId: string;
  organizationId: string;
  /** The staff member who started the turn, when one did (Try it); a customer's turn has none. */
  userId?: string;
  /** Few and fixed, set at the start: they cannot change later. */
  tags?: readonly string[];
  input?: unknown;
  metadata?: Record<string, unknown>;
  /**
   * The managed prompt the turn's model calls were made from, when it came from Langfuse (never the built-in text): each
   * model call of the turn is linked to it, so Langfuse shows the prompt and its version on every generation.
   */
  prompt?: TracedPrompt;
}

/** What a turn learned as it ran. Metadata merges by key; input and output replace what was there. */
export interface TraceNote {
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  level?: TraceLevel;
  statusMessage?: string;
}

/** A step a turn takes besides a model call: a look-up (retriever) or an action (tool), typed so the trace tree shows it. */
export interface StepStart {
  /** Stable, verb first: "look-up-and-decide". */
  name: string;
  type: "retriever" | "tool";
  input?: unknown;
  metadata?: Record<string, unknown>;
}

/** A model call as it starts: inside a turn it nests under it, else it is a trace of its own. */
export interface GenerationStart {
  /** Stable: "ai.suggest_reply", "ai.autopilot.understand_form". */
  name: string;
  /** The messages the model is sent, as role-labelled messages. */
  input: unknown;
  /** The model asked for, when the call names one. */
  model?: string;
  modelParameters?: Record<string, string | number>;
  metadata?: Record<string, unknown>;
  /** The managed prompt this one call was made from; without it, the running turn's (if any) is linked. */
  prompt?: TracedPrompt;
}

/** A model call as it ended: its answer, the model that gave it and the tokens it cost, or why there was none. */
export interface GenerationEnd {
  output?: unknown;
  model?: string;
  /**
   * `input` is the uncached part, cached input apart under the key Langfuse prices at a tenth; `output` is the words,
   * reasoning apart under Langfuse's key for it. Each token is counted once.
   */
  usage?: { input: number; output: number; input_cached_tokens?: number; output_reasoning_tokens?: number };
  level?: TraceLevel;
  statusMessage?: string;
}

export interface TracedGeneration {
  /** Ends the call's observation; a second end is ignored. */
  end(result: GenerationEnd): void;
}

export interface AiTracing {
  /** Runs `work` as one turn: the generations and notes made while it runs belong to it. */
  turn<T>(start: TurnStart, work: () => Promise<T>): Promise<T>;
  /** Adds to the turn running in this async context; outside a turn it does nothing. */
  note(note: TraceNote): void;
  /** Runs `work` as one step, nested where it runs; `ended` says what came of it (its output). */
  step<T>(start: StepStart, work: () => Promise<T>, ended?: (result: T) => TraceNote): Promise<T>;
  /** Starts a model call's observation, under the running turn if there is one, linked to the turn's prompt. */
  generation(start: GenerationStart): TracedGeneration;
  /** Sends what is buffered. Bounded in time, and never rejects. */
  flush(): Promise<void>;
  /** Sends what is buffered and stops. Bounded in time, and never rejects. */
  shutdown(): Promise<void>;
}

const quietGeneration: TracedGeneration = { end: () => undefined };

/** No tracing (no Langfuse keys): the work runs, and nothing is kept or sent. */
export const noTracing: AiTracing = {
  turn: (_start, work) => work(),
  note: () => undefined,
  step: (_start, work) => work(),
  generation: () => quietGeneration,
  flush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/** A DomainError's reason ("AI_UNAVAILABLE"): code's own words, never data. */
const REASON = /^[A-Z][A-Z0-9_]{1,63}$/;

/** What an error is, for a status message: its name, code and reason, never its message, which can quote anything. */
export function failureOf(error: unknown): string {
  const { errorName, errorCode } = errorFields(error);
  const reason =
    typeof error === "object" && error !== null && "reason" in error && typeof error.reason === "string"
      ? error.reason
      : "";
  return [errorName, errorCode ?? "", REASON.test(reason) ? reason : ""].filter((part) => part !== "").join(" ");
}
