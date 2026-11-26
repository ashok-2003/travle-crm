// The one agent's turn (spec 3; rulings R7, P7, P8): the tool agent runs the model and the tools until it answers, and
// the turn ends as natural's loop ends, so natural's act, dry answer and follow-up take it as they are. No word checks
// (R5) but one (the owner, 2026-11-26): a reply that shows an ID, a tool call or code is asked again once, never edited.
// No cap but LangGraph's steps; a failed model call ends the turn, and the worker's retries take over.
import { oneReadTools } from "@travel-crm/contracts/ai";
import type { AiMessage, AiToolCall } from "@travel-crm/integrations/ai";
import type { AgentModelCall, ToolAgent, ToolAgentInput } from "@travel-crm/integrations/tool-agent";
import type { CalendarDate } from "../../kernel/index.js";
import { mayEndSilent } from "../natural/loop/reply.js";
import { NATURAL_LIMITS, type LoopEnd, type LoopIO } from "../natural/loop/types.js";
import { appCheck, HAND_OVER_WORDS, NO_WORDS, replyWords } from "../natural/loop/words.js";
import { answeredCall, failedCall, type NaturalTraceBuilder } from "../natural/trace.js";
import type { StagedAction } from "../natural/types.js";
import type { OneContext } from "./context.js";
import { oneFallback, oneFinal } from "./ends.js";
import { codeInReply, codeWords } from "./reply-check.js";
import { oneAgentTools, startOneRun, type OneRun, type OneToolIO } from "./tools.js";

export interface OneLoopIO extends OneToolIO {
  agent: ToolAgent;
  /** One model call, counted against the month's limit (natural's countedModel). */
  call: LoopIO["call"];
  /** Whether the customer wrote again since the turn began: asked before every model call. */
  newerLine: () => Promise<boolean>;
  /** Epoch milliseconds, for each call's time in the trace. */
  clock: () => number;
}

export interface OneSettings {
  organizationId: string;
  /** Try it's choice, named on every call; without one, the first answer's model is pinned. */
  model?: string;
  temperature?: number;
  /** Staged by code before the model: they never end a turn without words. */
  forced: readonly StagedAction[];
  /** The organization's day: a fallback's task names a dropped trip's day by it. */
  today: CalendarDate;
}

/** Each model call in the trace, with its time; one the month's limit refused never reached a model. */
function traced(io: OneLoopIO, trace: NaturalTraceBuilder): AgentModelCall {
  return async (request) => {
    const started = io.clock();
    const result = await io.call(request);
    const ms = io.clock() - started;
    if (result.ok) trace.call(answeredCall(result, ms));
    else if (result.reason !== "limit") trace.call(failedCall(request, result.reason, ms));
    return result;
  };
}

/**
 * The reply written beside actions (ruling P8): Gemini often writes it beside send_brochure or book, then answers their
 * results with nothing. The newest answer since the last user message that staged an action decides: its words, when
 * all its calls were actions that went through. Words beside a read came before its facts, words beside a refused call
 * before the refusal, and an earlier answer's words never go beside a later answer's action.
 */
function wordsBesideActions(transcript: readonly AiMessage[]): string {
  const since = transcript.slice(transcript.findLastIndex((message) => message.role === "user") + 1);
  const refused = new Set(
    since.flatMap((message) =>
      message.role === "tool" && message.content.startsWith("refused:") ? [message.toolCallId] : [],
    ),
  );
  const staged = (call: AiToolCall) => !oneReadTools.some((read) => read === call.name) && !refused.has(call.id);
  const answer = since.findLast((message) => (message.toolCalls ?? []).some(staged));
  return answer?.toolCalls?.every(staged) === true ? replyWords(answer.content) : "";
}

/** A hand-over owes the customer a line (spec 3.5), unless it is for abuse. */
function owesLine(run: OneRun): boolean {
  const handOver = run.staged.get("hand_over");
  return handOver?.tool === "hand_over" && handOver.reason !== "abuse";
}

/** One turn of the one agent, ending as natural's loop does so the act and the dry answer take it as they are. */
export async function runOneLoop(
  context: OneContext,
  io: OneLoopIO,
  settings: OneSettings,
  trace: NaturalTraceBuilder,
): Promise<LoopEnd> {
  const run = startOneRun(settings.forced);
  trace.staged(run.staged);
  const input: ToolAgentInput = {
    messages: context.messages,
    tools: oneAgentTools(context.tools, io, run, trace, [...context.labels.keys()], context.media),
    request: {
      feature: "sales_agent",
      maxTokens: NATURAL_LIMITS.maxTokens,
      reasoning: { effort: "low" },
      timeoutMs: NATURAL_LIMITS.tryMs,
      user: settings.organizationId,
      ...(settings.model === undefined ? {} : { model: settings.model }),
      ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
    },
    call: traced(io, trace),
    superseded: () => io.newerLine(),
    onTool: (entry) => {
      trace.tool({ ...entry, refused: entry.result.startsWith("refused:") });
    },
  };
  const ending = { context, today: settings.today, trace };
  let next = input;
  let callsUsed = 0;
  let nudged = false;
  for (;;) {
    const end = await io.agent.run(next);
    callsUsed += end.calls;
    if (end.end === "superseded") return { end: "superseded" };
    if (end.end === "model_failed") return { end: "model_failed", reason: end.reason };
    if (end.end === "steps") return oneFallback("steps", run, ending);
    const written = replyWords(end.text) || wordsBesideActions(end.transcript);
    const found = codeInReply(written, context.codes);
    if (found === null && (written !== "" || mayEndSilent(run))) {
      return oneFinal(run, written, { transcript: end.transcript, callsUsed, model: end.model }, trace);
    }
    if (found !== null) trace.flag(`reply_shows:${found}`);
    // A hold, a resend, a hand-over or code's own actions owe the customer words: one more run asks for them.
    if (nudged) return oneFallback("model", run, ending);
    nudged = true;
    next = {
      ...input,
      messages: [
        ...end.transcript,
        appCheck(found !== null ? codeWords(found) : owesLine(run) ? HAND_OVER_WORDS : NO_WORDS),
      ],
      // The model that wrote the transcript goes on with it (P7), unless Try it named its own.
      request: { model: end.model, ...input.request },
    };
  }
}
