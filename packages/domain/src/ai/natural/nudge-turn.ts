// The natural agent's follow-up turn (plan 2, Task 7; ruling 13): the live turn's reads and gates with the follow-up's own
// on top (fewer than two sent, the silence unbroken since the last turn that ran, an open lead, the agency's waking hours),
// then one call whose only tool is stay_quiet, then the same act as a reply's. A line that can't be had or is refused sends
// nothing and tells nobody: a follow-up is a courtesy, never an answer owed, so it has no fallback line and no retry.
import { randomUUID } from "node:crypto";
import type { NaturalTrace } from "@travel-crm/contracts/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { inWakingHours, nextMorning, stillQuiet } from "../lite/follow-ups.js";
import { buildNaturalContext, type NaturalContext } from "./context/build.js";
import { stampOf } from "./context/chat-turns.js";
import { liveLoopIO } from "./live-io.js";
import { runNaturalLoop, type LoopSettings } from "./loop.js";
import { prepareNaturalTurn, type NaturalPrepared } from "./prepare.js";
import type { NaturalPrompt } from "./prompt.js";
import { naturalPromptOf } from "./prompt-source.js";
import { startNaturalTrace } from "./trace.js";
import { actOnTurn, type LiveTurn } from "./turn-act.js";
import { actOfEnd, doneOf, endedOf, type TurnDone } from "./turn-done.js";
import { logNaturalTurn, naturalTurnNote, naturalTurnStart } from "./turn-note.js";

const MOST_FOLLOW_UPS = 2;

/** The live turn's dependencies (`NaturalTurnDependencies` in turn.ts, which routes here): lite's, and Langfuse's prompts. */
export interface NudgeDependencies extends LiteDependencies {
  prompts?: AiPrompts;
}

/** What the model reads beside the chat: which follow-up this is, since when, and what is asked of it. */
export const nudgeNotice = (number: number, quietSince: string) =>
  `This is follow-up ${String(number)} of ${String(MOST_FOLLOW_UPS)}, and the customer has been quiet since ${quietSince}; ` +
  "there are no new messages. Write one short, warm line as yourself, picking up where the chat left off, or call " +
  "stay_quiet if there is nothing worth saying. Never pushy, and never the same words as before.";

/**
 * The follow-up's own gates, read once the turn's shared ones passed: how many went already (the number of this one),
 * the day's cap and the month's limit, the silence (a 👍 on ours answers; counted from the last turn that ran, so an "ok"
 * a quiet turn read does not end it), the open lead, and the waking hours, which hold it until 09:00 while the window
 * still can.
 */
export async function nudgeGate(
  deps: NudgeDependencies,
  input: LiteTurnInput,
  prepared: NaturalPrepared,
  now: Date,
): Promise<number | LiteOutcome> {
  const { chat, facts, timeZone } = prepared;
  const quietSince = facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt);
  return deps.db.forOrg(input.organizationId, async (tx) => {
    const state = await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { followUpsSent: true } });
    // Two went already: a time left on the chat brings no third.
    if (state === null || state.followUpsSent >= MOST_FOLLOW_UPS) return "nothing";
    if (prepared.monthFull) return "limit";
    if (prepared.repliesToday >= prepared.dayCap) return "day_limit";
    if (!(await stillQuiet(tx, chat.id, { reactions: true, since: quietSince }))) return "answered";
    // A lead the team closed with no word to the customer was a person's decision, and a follow-up never opens one.
    if (prepared.leadId === null) return "no_open_lead";
    if (!inWakingHours(now, timeZone)) {
      const morning = chat.lastInboundAt === null ? null : nextMorning(now, chat.lastInboundAt, timeZone);
      if (morning !== null) {
        await tx.aiChat.updateMany({
          where: { conversationId: chat.id, followUpAt: null },
          data: { followUpAt: morning },
        });
      }
      return "night";
    }
    return state.followUpsSent + 1;
  });
}

/** The context the follow-up's one call reads: the turn's, with stay_quiet the only tool. */
function contextOf(prepared: NaturalPrepared, prompt: NaturalPrompt, input: { number: number; now: Date }) {
  const { facts, timeZone, today } = prepared;
  const quiet = facts.lastTurnAt === null ? input.now : new Date(facts.lastTurnAt);
  const context = buildNaturalContext({
    prompt,
    voice: prepared.voice,
    timeZone,
    today,
    now: input.now,
    answers: prepared.answers,
    sheets: prepared.sheets,
    lead: prepared.lead,
    facts,
    lines: prepared.lines,
    cameFrom: prepared.cameFrom,
    notice: nudgeNotice(input.number, stampOf(quiet, { today, timeZone })),
    withTools: true,
  });
  return { ...context, tools: context.tools.filter((tool) => tool.name === "stay_quiet") } satisfies NaturalContext;
}

async function followUp(
  turn: LiveTurn,
  prompt: NaturalPrompt,
  number: number,
  timing: { startedMs: number; clock: () => number },
  trace: ReturnType<typeof startNaturalTrace>,
): Promise<TurnDone> {
  const { deps, input, now, prepared } = turn;
  const context = contextOf(prepared, prompt, { number, now });
  const { io, flagContext } = liveLoopIO(deps, prepared, input, context, now, timing.clock);
  const settings: LoopSettings = {
    startedMs: timing.startedMs,
    organizationId: input.organizationId,
    forced: [],
    flagContext,
  };
  const end = await runNaturalLoop(context, io, settings, trace);
  switch (end.end) {
    case "superseded":
      return endedOf(turn, "superseded", null);
    // No fallback line, no retry, no task: the customer asked nothing of us.
    case "model_failed":
      return endedOf(turn, "nothing", end.reason);
    case "fallback":
      return endedOf(turn, "nothing", end.reason);
    case "final": {
      const act = actOfEnd(end);
      const result = await actOnTurn(turn, act);
      return "refused" in result ? endedOf(turn, "blocked", result.refused) : doneOf(turn, act, result);
    }
  }
}

/** The follow-up for a customer gone quiet: one trace of its chat, one log line; the outcome is what the worker keeps. */
export async function runNaturalNudge(deps: NudgeDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome> {
  const clock = () => deps.clock?.().getTime() ?? Date.now();
  const startedMs = clock();
  const [prompt, prepared] = await Promise.all([naturalPromptOf(deps.prompts), prepareNaturalTurn(deps, input, now)]);
  const leadId = typeof prepared === "string" ? null : prepared.leadId;
  const start = naturalTurnStart(input, prompt, leadId);
  const work = async (): Promise<LiteOutcome> => {
    const finish = (done: TurnDone, trace: NaturalTrace | null) => {
      try {
        deps.tracing?.note(naturalTurnNote(done, trace));
      } catch {
        // A note that fails costs the trace its detail, never the turn.
      }
      logNaturalTurn(deps.logger, input, done, trace?.calls.length ?? 0, clock() - startedMs);
      return done.outcome;
    };
    const ended = (outcome: LiteOutcome): TurnDone => ({
      outcome,
      reason: null,
      messages: [],
      actions: [],
      fallback: null,
      leadId,
    });
    if (typeof prepared === "string") return finish(ended(prepared), null);
    const number = await nudgeGate(deps, input, prepared, now);
    if (typeof number === "string") return finish(ended(number), null);
    const turn: LiveTurn = { deps, input, now, prepared, traceId: randomUUID(), actions: [] };
    const trace = startNaturalTrace(prompt, startedMs);
    const done = await followUp(turn, prompt, number, { startedMs, clock }, trace);
    return finish(done, trace.finish(done.outcome, done.fallback, clock()));
  };
  return deps.tracing === undefined ? work() : deps.tracing.turn(start, work);
}
