// A turn's stored file as the console shows it: the blocks in the file's order, the chat's messages as kept now, the
// lookups as indented JSON, and each prompt piece's version beside today's. Pure: it reads nothing.
import type { AiTraceFile, AiTraceMessage } from "@travel-crm/contracts/platform";
import { promptLibrary, promptVersions, type ContextMessage, type TraceFile } from "../ai/index.js";

const messageView = (message: ContextMessage): AiTraceMessage => ({
  id: message.id,
  from: message.from,
  at: message.at.toISOString(),
  kind: message.kind,
  text: message.text,
});

const blocksOf = (blocks: Record<string, string>) => Object.entries(blocks).map(([title, text]) => ({ title, text }));

/** `messages` are those found for the file's message ids (its context's and its sent ones), in any order. */
export function traceFileView(file: TraceFile, messages: ContextMessage[]): AiTraceFile {
  const { trace } = file;
  const found = new Map(messages.map((message) => [message.id, message]));
  const context = [...new Set(trace.messageIds)];
  const sent = [...new Set(trace.sent.messageIds)];
  const current: Record<string, number> = promptVersions();
  const used: Record<string, number> = trace.promptVersions;
  const known = promptLibrary().map((piece) => piece.name as string);
  const names = [...known.filter((name) => name in used), ...Object.keys(used).filter((name) => !known.includes(name))];
  return {
    intents: trace.intents,
    promptVersions: names.map((name) => ({ name, used: used[name] ?? 0, current: current[name] ?? null })),
    understand:
      trace.understand === null ? null : { blocks: blocksOf(trace.understand.blocks), answer: trace.understand.raw },
    messages: context.flatMap((id) => {
      const message = found.get(id);
      return message === undefined ? [] : [messageView(message)];
    }),
    messagesGone: [...new Set([...context, ...sent])].filter((id) => !found.has(id)).length,
    lookups: trace.lookups.map(({ request, result }) => ({
      tool: request.tool,
      request: JSON.stringify(request, null, 2),
      result: JSON.stringify(result, null, 2),
    })),
    decision: {
      why: trace.why,
      note: trace.note,
      task: trace.task,
      suggest: trace.suggest === null ? null : { kind: trace.suggest.kind, reason: trace.suggest.reason },
    },
    checks: trace.checks,
    write: trace.write === null ? null : { blocks: blocksOf(trace.write.blocks), answers: trace.write.raw },
    sent: {
      text: trace.sent.text,
      messages: sent.flatMap((id) => {
        const message = found.get(id);
        return message === undefined ? [] : [messageView(message)];
      }),
    },
    actions: trace.actions,
  };
}
