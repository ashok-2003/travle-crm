// The live natural turn as a trace and a log line (ruling L2): one trace of the chat ("whatsapp:<chat>" as its session),
// named for its kind, linked to the Langfuse prompt it ran so each model call shows it, with ids alone at its start; the
// customer's new lines go in, the words sent come out, and the note holds what Try it's does: each tool call with its
// arguments and result, the guards' verdicts, the staged actions, a fallback and its reason and the prompt version. The
// log line holds codes, counts and timings only.
import type { NaturalTrace } from "@travel-crm/contracts/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { TraceLevel, TraceNote, TurnStart } from "@travel-crm/integrations/tracing";
import type { LiteTurnInput } from "../lite/types.js";
import type { NaturalPrompt } from "./prompt.js";
import type { TurnDone } from "./turn-done.js";
import type { NaturalChatLine } from "./types.js";

const KIND_NAMES = { reply: "reply", nudge: "follow-up" } as const;
const WARNINGS = new Set(["fallback", "blocked", "not_ready", "nothing"]);

export function naturalTurnStart(input: LiteTurnInput, prompt: NaturalPrompt, leadId: string | null): TurnStart {
  const { source } = prompt;
  const kind = KIND_NAMES[input.kind];
  return {
    name: `whatsapp-agent.natural.${kind}`,
    sessionId: `whatsapp:${input.conversationId}`,
    organizationId: input.organizationId,
    tags: ["whatsapp-agent", "natural", kind],
    // A prompt from Langfuse is linked to each model call; the built-in text is none of Langfuse's.
    ...(source === undefined ? {} : { prompt: { name: source.name, version: source.version } }),
    metadata: {
      agent: "natural",
      organizationId: input.organizationId,
      chatId: input.conversationId,
      leadId,
      token: input.token,
      promptVersion: prompt.version,
      promptLabel: source?.label ?? null,
    },
  };
}

/** The customer's new lines as the trace's input: a photo or a voice note with no words by its kind. */
export const turnInputOf = (lines: readonly NaturalChatLine[]) =>
  lines.map((line) => ({ role: "user", content: line.text === "" ? `[${line.kind}]` : line.text }));

/** A model that answered nothing is an error; the fallback line, or a turn the team must look at, a warning. */
function levelOf(outcome: string): TraceLevel {
  if (outcome === "model_failed") return "ERROR";
  return WARNINGS.has(outcome) ? "WARNING" : "DEFAULT";
}

/** The finished turn as a note: what went out (or why nothing did), and what it learned; a gate's outcome alone. */
export function naturalTurnNote(done: TurnDone, trace: NaturalTrace | null): TraceNote {
  const { outcome, reason } = done;
  const ended = { outcome, reason, leadId: done.leadId, actions: done.actions };
  return {
    output:
      done.messages.length === 0
        ? { outcome, reason }
        : // Two messages read as the model wrote them: a `---` line sits between.
          { role: "assistant", content: done.messages.join("\n---\n") },
    metadata:
      trace === null
        ? ended
        : {
            ...ended,
            promptVersion: trace.promptVersion,
            fallback: trace.fallback,
            restarted: trace.restarted,
            // Each tool call with the model call that made it (counted from 1), its arguments and its result.
            toolCalls: trace.calls.flatMap((call, index) => call.tools.map((tool) => ({ call: index + 1, ...tool }))),
            guards: trace.guards,
            staged: trace.staged,
            flags: trace.flags,
            calls: trace.calls.map((call) => ({ ...call, tools: call.tools.length })),
            durationMs: trace.durationMs,
          },
    statusMessage: reason === null ? outcome : `${outcome}: ${reason}`,
    level: levelOf(outcome),
  };
}

/** The turn's one log line: codes, counts and timings, never a customer's word. */
export function logNaturalTurn(
  logger: Logger | undefined,
  input: LiteTurnInput,
  done: TurnDone,
  calls: number,
  ms: number,
) {
  logger?.info(
    {
      event: "ai.turn",
      agent: "natural",
      outcome: done.outcome,
      ...(done.reason === null ? {} : { reason: done.reason }),
      kind: input.kind,
      calls,
      ms,
    },
    "The natural AI turn ended",
  );
}
