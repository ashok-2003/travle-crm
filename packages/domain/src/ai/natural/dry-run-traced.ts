// Try it on the natural agent as a traced turn: each test turn one trace of its test chat, marked as a Try it test (its tags
// and name), the session the chat's own id, or a random one when the client sends none (never a customer's chat). The test
// chat goes in, what the customer would get comes out, and what the turn learned is noted: each tool call with its
// arguments and result, the guards' verdicts, a fallback and its reason, the staged actions and the prompt version. Its
// model calls nest inside as generations, linked to the turn's prompt when it came from Langfuse. Without a tracing it is
// the dry run alone.
import { randomUUID } from "node:crypto";
import type { NaturalTestAnswer } from "@travel-crm/contracts/ai";
import type { AiTracing, TraceLevel, TraceNote } from "@travel-crm/integrations/tracing";
import type { MemberAccess } from "../../identity/index.js";
import { naturalDryRun, type NaturalTestChat } from "./dry-run.js";
import type { NaturalDryDependencies } from "./dry-turn.js";

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
        : { role: "assistant", content: answer.messages.join("\n\n") },
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

export function naturalTryItTurn(
  deps: NaturalDryDependencies & { tracing?: AiTracing },
  access: MemberAccess,
  chat: NaturalTestChat & { chatId?: string },
  now: Date,
): Promise<NaturalTestAnswer> {
  const { tracing } = deps;
  if (tracing === undefined) return naturalDryRun(deps, access, chat, now);
  const { source } = chat.prompt;
  return tracing.turn(
    {
      name: "whatsapp-agent.natural.try-it",
      sessionId: `try-it:${chat.chatId ?? randomUUID()}`,
      organizationId: access.organizationId,
      userId: access.userId,
      tags: ["whatsapp-agent", "natural", "try-it"],
      input: chat.messages.map((line) => ({
        role: line.from === "customer" ? "user" : "assistant",
        content: line.text,
      })),
      // A prompt from Langfuse is linked to each model call; the built-in text is none of Langfuse's.
      ...(source === undefined ? {} : { prompt: { name: source.name, version: source.version } }),
      metadata: {
        agent: "natural",
        tryIt: true,
        promptVersion: chat.prompt.version,
        promptLabel: source?.label ?? null,
        model: chat.model ?? "live",
        temperature: chat.temperature ?? null,
        state: chat.state,
      },
    },
    async () => {
      const answer = await naturalDryRun(deps, access, chat, now);
      try {
        tracing.note(naturalTryItNote(answer));
      } catch {
        // A note that fails costs the trace its detail, never the answer.
      }
      return answer;
    },
  );
}
