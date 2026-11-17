// What the one agent reads of a chat (spec 9): the summary, refreshed first when more than 30 messages follow its point,
// and only the lines after that point, with no raw tail. The customer's new lines are always among them.
import type { LiteTurnInput } from "../lite/types.js";
import { refreshChatSummary, type ChatSummary } from "../chat-summary/index.js";
import { countedModel } from "../natural/counted-model.js";
import { newLinesOf } from "../natural/context/chat-turns.js";
import type { NaturalPrepared } from "../natural/prepare.js";
import type { NaturalTraceBuilder } from "../natural/trace.js";
import type { NaturalChatLine } from "../natural/types.js";
import type { OneTurnDependencies } from "./live-io.js";

const isAfter = (line: NaturalChatLine, point: ChatSummary) =>
  point.throughAt === null ||
  line.at.getTime() > point.throughAt.getTime() ||
  (line.at.getTime() === point.throughAt.getTime() && line.id > (point.throughId ?? ""));

/** The summary and the lines after its point; a refresh that fails leaves the old summary and point (the turn goes on). */
export async function chatMemoryOf(
  deps: OneTurnDependencies,
  prepared: NaturalPrepared,
  input: LiteTurnInput,
  now: Date,
  trace: NaturalTraceBuilder,
): Promise<{ summary: string | null; lines: NaturalChatLine[] }> {
  const { organizationId } = input;
  const { timeZone, today } = prepared;
  const lastTurnAt = prepared.facts.lastTurnAt === null ? null : new Date(prepared.facts.lastTurnAt);
  const newLines = newLinesOf(prepared.lines, lastTurnAt);
  const first = newLines[0];
  const step = await refreshChatSummary(
    {
      db: deps.db,
      call: countedModel(deps.ai, { db: deps.db, organizationId, now, timeZone }),
      ...(deps.prompts === undefined ? {} : { prompts: deps.prompts }),
      ...(deps.identity === undefined ? {} : { identity: deps.identity }),
    },
    {
      organizationId,
      conversationId: input.conversationId,
      agencyName: prepared.voice.agencyName,
      lead: prepared.lead,
      clock: { today, timeZone },
      now,
      before: first === undefined ? null : { at: first.at, id: first.id },
    },
  );
  if (step.kind === "refreshed") trace.flag("summary:refreshed");
  if (step.kind === "failed") trace.flag(`summary:failed:${step.reason}`);
  const { summary } = step;
  if (summary.text === "") return { summary: null, lines: prepared.lines };
  const isNew = new Set(newLines);
  return {
    summary: summary.text,
    lines: prepared.lines.filter((line) => isNew.has(line) || isAfter(line, summary)),
  };
}
