// The natural agent's loop as its callers see it: the caps, what it asks of the turn around it (the model, the tools, the
// guards, the chat and the clock), its settings and how a turn ends; and one run of the turn, which a restart begins again.
import type { NaturalToolName } from "@travel-crm/contracts/ai";
import {
  NEXT_MODEL_MIN_LEFT_MS,
  type AiEffort,
  type AiFailure,
  type AiMessage,
  type AiRequest,
  type AiResult,
} from "@travel-crm/integrations/ai";
import type { GuardName, traceFlags, WordsVerdict } from "../guards/check-words.js";
import type { StageOutcome } from "../tools/action-tools.js";
import type { QuoteFigures, StagedAction, StagedSet } from "../types.js";

/**
 * The turn's caps (spec 3.2, with the owner's time limits of 2026-11-15): 4 calls; 2 minutes from the turn's start; a
 * minute a try at most; no call with under 5 seconds left; another model, or a restart, only while 20 seconds remain;
 * 8,000 tokens a call, thinking included; at most 2 WhatsApp messages.
 */
export const NATURAL_LIMITS = {
  calls: 4,
  turnMs: 120_000,
  tryMs: 60_000,
  lastCallMs: 5_000,
  nextModelMs: NEXT_MODEL_MIN_LEFT_MS,
  maxTokens: 8_000,
  messages: 2,
} as const;

export type ReadToolName = "find_trips" | "get_trip" | "quote";

/** What the loop asks of the turn around it: Try it's dry turn and the live turn each give their own. */
export interface LoopIO {
  /** One model call, counted against the month's limit: "limit" when none is left. */
  call(request: AiRequest): Promise<AiResult | { ok: false; reason: "limit" }>;
  read(name: ReadToolName, args: Record<string, unknown>): Promise<{ result: string; figures: QuoteFigures | null }>;
  /** Checks an action against the data and stages it, or refuses it; `quoted` holds this turn's figures so far. */
  stage(
    name: NaturalToolName,
    args: Record<string, unknown>,
    words: string,
    quoted: readonly QuoteFigures[],
  ): Promise<StageOutcome>;
  check(words: string, staged: StagedSet, quoted: readonly QuoteFigures[]): WordsVerdict;
  /** Whether the customer wrote again since the turn began: the newer turn answers everything. */
  newerLine(): Promise<boolean>;
  /** Epoch milliseconds. */
  clock(): number;
}

export interface LoopSettings {
  startedMs: number;
  organizationId: string;
  /** Try it's own choice, named on every call; without one, the first answer's model is pinned. */
  model?: string;
  temperature?: number;
  /** Staged by code before the model (ruling 6): they never end a turn. */
  forced: readonly StagedAction[];
  /** Calls spent already (0 unless set): plan 2's one more call after an act refusal passes them. */
  callsUsed?: number;
  flagContext: Parameters<typeof traceFlags>[1];
}

export type FallbackReason = "cap" | "steps" | "deadline" | `guard:${GuardName}` | "model";

export type LoopEnd =
  | {
      end: "final";
      /** At most two WhatsApp messages; none when an action ends the turn without words. */
      messages: string[];
      staged: StagedSet;
      quoted: QuoteFigures[];
      /** The context's messages and the run's since, ending with the final response and its calls' results. */
      transcript: AiMessage[];
      callsUsed: number;
      model: string;
    }
  | {
      end: "fallback";
      reason: FallbackReason;
      /** Nothing goes to the customer (the owner, 2026-11-24): only these, the agency's own actions, and the task. */
      staged: StagedSet;
      /** For the team: why, what the customer wrote, and the refused draft if there was one. */
      task: string;
      draft: string | null;
    }
  | { end: "superseded" }
  | { end: "model_failed"; reason: AiFailure | "limit" };

/** One run of the turn: a restart begins another, with the context's messages and code's own actions alone. */
export interface TurnRun {
  messages: AiMessage[];
  staged: StagedSet;
  /** The actions the model staged in this run: only these end a turn without words (pre-flight #14). */
  modelStaged: Set<StagedAction["tool"]>;
  quoted: QuoteFigures[];
  /** The model every call names: Try it's, or the first answer's once pinned (ruling 12). */
  model: string | undefined;
  effort: AiEffort;
  retried: boolean;
  nudged: boolean;
  /** The last words the guards refused. */
  draft: string | null;
}
