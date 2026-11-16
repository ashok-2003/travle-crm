// Try it as a traced turn: each test turn one trace of the person's test chat (its session follows the chat's first line, so
// a chat's turns group together), with the test chat in, the agent's answer out, and why, with what code would do, as
// metadata. Its two model calls nest inside. Without a tracing it is the dry run alone.
import { createHash } from "node:crypto";
import type { TestAiAnswer } from "@travel-crm/contracts/ai";
import type { AiTracing, TraceNote } from "@travel-crm/integrations/tracing";
import type { MemberAccess } from "../../identity/index.js";
import { liteDryRun } from "./dry-run.js";

type DryRunDependencies = Parameters<typeof liteDryRun>[0];
type DryRunChat = Parameters<typeof liteDryRun>[2];

/** The test chat's session: the person, and its first line, which every later turn of the chat sends again. */
function tryItSession(userId: string, chat: DryRunChat): string {
  const first = chat.messages[0]?.text ?? "";
  return `try-it:${userId}:${createHash("sha256").update(first).digest("hex").slice(0, 16)}`;
}

function answerNote(answer: TestAiAnswer): TraceNote {
  const { blocked } = answer.dryRun;
  const status = blocked ?? (answer.handoff ? "handed_off" : "answered");
  return {
    output: answer.answer === "" ? { handoff: answer.handoff, blocked } : { role: "assistant", content: answer.answer },
    metadata: {
      ...answer.trace,
      handoff: answer.handoff,
      reason: answer.reason,
      dryRun: answer.dryRun,
      nextState: answer.state,
      outcome: status,
    },
    statusMessage: status,
    level: blocked === null ? "DEFAULT" : "WARNING",
  };
}

export function tryItTurn(
  deps: DryRunDependencies & { tracing?: AiTracing },
  access: MemberAccess,
  chat: DryRunChat,
  now: Date,
): Promise<TestAiAnswer> {
  const { tracing } = deps;
  if (tracing === undefined) return liteDryRun(deps, access, chat, now);
  return tracing.turn(
    {
      name: "whatsapp-agent.try-it",
      sessionId: tryItSession(access.userId, chat),
      organizationId: access.organizationId,
      userId: access.userId,
      tags: ["whatsapp-agent", "try-it"],
      input: chat.messages.map((line) => ({
        role: line.from === "customer" ? "user" : "assistant",
        content: line.text,
      })),
      metadata: { model: chat.model ?? "live", temperature: chat.temperature ?? null, state: chat.state },
    },
    async () => {
      const answer = await liteDryRun(deps, access, chat, now);
      tracing.note(answerNote(answer));
      return answer;
    },
  );
}
