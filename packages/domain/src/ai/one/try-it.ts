// Try it on the one agent: the owner's test chat as chat lines, one dry turn on it, traced as one turn of that chat when
// the server traces (Langfuse). Its prompt is always Langfuse's `latest`; nothing is sent, held or kept.
import { randomUUID } from "node:crypto";
import type { NaturalTestAnswer } from "@travel-crm/contracts/ai";
import type { AiTracing } from "@travel-crm/integrations/tracing";
import type { ToolAgent } from "@travel-crm/integrations/tool-agent";
import type { MemberAccess } from "../../identity/index.js";
import { naturalTryItNote } from "../natural/dry-run-traced.js";
import { chatLinesOf, type NaturalTestChat } from "../natural/dry-run.js";
import type { NaturalDryDependencies } from "../natural/dry-turn.js";
import { oneDryTurn } from "./dry-turn.js";

export function oneTryItTurn(
  deps: NaturalDryDependencies & { toolAgent: ToolAgent; tracing?: AiTracing },
  access: MemberAccess,
  chat: NaturalTestChat & { chatId?: string; tap?: "book" | "change" },
  now: Date,
): Promise<NaturalTestAnswer> {
  const { tracing } = deps;
  const { model, temperature } = chat;
  const run = () =>
    oneDryTurn(deps, access.organizationId, {
      lines: chatLinesOf(chat.messages, chat.state?.facts.lastTurnAt ?? null, now),
      state: chat.state,
      now,
      prompt: chat.prompt,
      ...(chat.tap === undefined ? {} : { tap: chat.tap }),
      choice: {
        ...(model === undefined ? {} : { model }),
        ...(temperature === undefined ? {} : { temperature }),
      },
    });
  if (tracing === undefined) return run();
  const { source } = chat.prompt;
  return tracing.turn(
    {
      name: "whatsapp-agent.one.try-it",
      sessionId: `try-it:${chat.chatId ?? randomUUID()}`,
      organizationId: access.organizationId,
      userId: access.userId,
      tags: ["whatsapp-agent", "one", "try-it"],
      input: chat.messages.map((line) => ({
        role: line.from === "customer" ? "user" : "assistant",
        content: line.text,
      })),
      ...(source === undefined ? {} : { prompt: { name: source.name, version: source.version } }),
      metadata: {
        agent: "one",
        tryIt: true,
        promptVersion: chat.prompt.version,
        promptLabel: source?.label ?? null,
        model: model ?? "live",
        temperature: temperature ?? null,
        state: chat.state,
      },
    },
    async () => {
      const answer = await run();
      try {
        tracing.note(naturalTryItNote(answer));
      } catch {
        // A note that fails costs the trace its detail, never the answer.
      }
      return answer;
    },
  );
}
