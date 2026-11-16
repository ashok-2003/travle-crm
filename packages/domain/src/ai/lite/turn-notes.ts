// What a traced agent turn says about itself (the owner, 2026-11-16: "trace all think and output and input"): its chat as the
// session, what the customer wrote as its input, what went out (or why nothing did) as its output, and the whole lite trace
// (what Understand and Write were shown and answered, the lookups, the checks, the move and why) as its metadata. The
// tracing port decides where that goes, Langfuse or nowhere; nothing here changes what the turn does.
import type { AiTracing, TraceLevel, TraceNote, TurnStart } from "@travel-crm/integrations/tracing";
import type { ContextMessage, LiteOutcome, LiteTrace, LiteTurnInput, TraceSink } from "./types.js";

/** A model that failed is an error; a turn that sent nothing for a reason worth a look, a warning. */
const ERROR_OUTCOMES = new Set(["unavailable", "rate_limited"]);
const WARNING_OUTCOMES = new Set([
  "unfit",
  "blocked",
  "refused",
  "cannot_answer",
  "nothing",
  "not_ready",
  "limit",
  "day_limit",
  "not_configured",
]);

export function outcomeLevel(outcome: LiteOutcome): TraceLevel {
  if (ERROR_OUTCOMES.has(outcome)) return "ERROR";
  return WARNING_OUTCOMES.has(outcome) ? "WARNING" : "DEFAULT";
}

/** A live turn as it starts: named for its kind, one session per chat. */
export const turnStart = (input: LiteTurnInput): TurnStart => ({
  name: `whatsapp-agent.${input.kind}`,
  sessionId: input.conversationId,
  organizationId: input.organizationId,
  tags: ["whatsapp-agent", input.kind],
  metadata: { conversationId: input.conversationId, token: input.token, kind: input.kind },
});

/** How the turn ended, noted last: the outcome as its status, and its level. */
export const outcomeNote = (outcome: LiteOutcome): TraceNote => ({
  metadata: { outcome },
  statusMessage: outcome,
  level: outcomeLevel(outcome),
});

/** Chat lines as role-labelled messages: the customer's are the user's; ours and the team's (named so) the assistant's. */
export function chatInput(messages: readonly ContextMessage[]): { role: string; content: string; name?: string }[] {
  return messages.map((message) => ({
    role: message.from === "customer" ? "user" : "assistant",
    content:
      message.kind === "text" ? message.text : `[${message.kind}]${message.text === "" ? "" : ` ${message.text}`}`,
    ...(message.from === "team" ? { name: "team" } : {}),
  }));
}

/** A finished lite turn as a note: the words sent as the output (or why none went), everything it knew as metadata. */
export function liteTraceNote(trace: LiteTrace): TraceNote {
  return {
    output:
      trace.sent.text === null
        ? { outcome: trace.outcome, reason: trace.reason }
        : { role: "assistant", content: trace.sent.text },
    metadata: {
      outcome: trace.outcome,
      reason: trace.reason,
      move: trace.move,
      stage: trace.stage,
      why: trace.why,
      asked: trace.asked,
      intents: trace.intents,
      note: trace.note,
      task: trace.task,
      suggest: trace.suggest,
      understand: trace.understand,
      lookups: trace.lookups,
      checks: trace.checks,
      write: trace.write,
      sent: trace.sent,
      actions: trace.actions,
      leadId: trace.leadId,
      model: trace.model,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      promptVersions: trace.promptVersions,
      messageIds: trace.messageIds,
      durationMs: trace.durationMs,
      liteTraceId: trace.id,
    },
  };
}

/**
 * The trace sink with each finished turn also noted on its traced turn. finishTurn calls it inside the turn's work, so the
 * note lands in the turn's own async context; the stored trace is kept by `inner` as before.
 */
export function notingSink(tracing: AiTracing, inner: TraceSink | undefined): TraceSink {
  return {
    async record(trace) {
      tracing.note(liteTraceNote(trace));
      await inner?.record(trace);
    },
  };
}
