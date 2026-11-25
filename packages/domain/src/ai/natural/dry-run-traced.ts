// A Try it turn's note on its trace: what the customer would get as the output, and what the turn learned as metadata:
// each tool call with its arguments and result, a fallback and its reason, the staged actions and the prompt version.
import type { NaturalTestAnswer } from "@travel-crm/contracts/ai";
import type { TraceLevel, TraceNote } from "@travel-crm/integrations/tracing";

/** A model that answered nothing is an error; a fallback for any other reason (a guard, the caps), a warning. */
function levelOf(fallback: string | null): TraceLevel {
  if (fallback === null) return "DEFAULT";
  return fallback.startsWith("model_failed") ? "ERROR" : "WARNING";
}

/** The finished turn as a note: what the customer would get as the output, everything it learned as metadata. */
export function naturalTryItNote(answer: NaturalTestAnswer): TraceNote {
  const { trace } = answer;
  return {
    output:
      answer.messages.length === 0
        ? { outcome: answer.outcome, fallback: trace.fallback }
        : // Two messages read as the model wrote them: a blank line is spacing inside one, a `---` line sits between.
          { role: "assistant", content: answer.messages.join("\n---\n") },
    metadata: {
      promptVersion: trace.promptVersion,
      outcome: answer.outcome,
      fallback: trace.fallback,
      restarted: trace.restarted,
      // Each tool call with the model call that made it (counted from 1), its arguments and its result.
      toolCalls: trace.calls.flatMap((call, index) => call.tools.map((tool) => ({ call: index + 1, ...tool }))),
      guards: trace.guards,
      staged: trace.staged,
      flags: trace.flags,
      calls: trace.calls.map((call) => ({ ...call, tools: call.tools.length })),
      actions: answer.actions,
      payment: answer.payment,
      nextState: answer.state,
      durationMs: trace.durationMs,
    },
    statusMessage: trace.fallback === null ? answer.outcome : `${answer.outcome}: ${trace.fallback}`,
    level: levelOf(trace.fallback),
  };
}
