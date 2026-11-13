// The lite agent's follow-up turn (plan 3b): one read, no Understand and no lookups, the model asked only for the
// follow-up's line, then the same act as a reply's, which reads every check again under the chat's lock. A line that
// can't be had or is refused sends nothing and tells nobody: a follow-up is a courtesy, never an answer owed.
import type { CallEnvironment } from "../grounded/turn-calls.js";
import { prepareNudge } from "./nudge-prepare.js";
import { finishTurn, startTrace, tallied, writeChecks, type TurnLog } from "./turn-trace.js";
import { acted, written } from "./turn-steps.js";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "./types.js";

export async function runLiteNudge(deps: LiteDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome> {
  const startedMs = Date.now();
  const prepared = await prepareNudge(deps, input, now);
  if (typeof prepared === "string") return finishTurn(deps, input, { outcome: prepared, log: {}, startedMs }, null);
  const { organizationId } = input;
  const { decision, situation } = prepared;
  const trace = startTrace(input, prepared.leadId, now);
  const log: TurnLog = { move: decision.move.kind };
  const end = (outcome: LiteOutcome, reason?: string) =>
    finishTurn(
      deps,
      input,
      { outcome, log: { ...log, ...(reason === undefined ? {} : { reason }) }, startedMs },
      trace,
    );
  trace.move = decision.move.kind;
  trace.stage = decision.stage;
  trace.why = decision.why;
  const agencyName = await deps.agencyName(organizationId);
  const environment: CallEnvironment = { db: deps.db, organizationId, now, timeZone: prepared.timeZone };
  const words = await written(tallied(deps.ai, trace), environment, prepared, {
    decision,
    situation,
    agencyName,
    summary: prepared.summary,
  });
  // Every follow-up has a line to write; none here is a bug, and nothing goes.
  if (words === null) return end("nothing");
  trace.write = { blocks: words.blocks, raw: words.written.raw };
  trace.checks.push(...writeChecks(words.written));
  const line = words.written;
  if (line.kind === "ended") return end(line.outcome);
  if (line.kind === "refused") return end("refused", line.code);
  if (line.kind === "cannot_answer") return end("cannot_answer");

  const result = await acted(deps, null, {
    organizationId,
    conversationId: prepared.chat.id,
    token: input.token,
    kind: input.kind,
    now,
    today: prepared.today,
    timeZone: prepared.timeZone,
    decision,
    language: decision.facts.language,
    reply: { text: line.text, filled: line.filled },
    situation,
    checked: null,
    model: trace.model,
    agencyName,
  });
  if (result === "already") return end("answered");
  // The customer or a person wrote, the chat was taken over, a switch went off or the agent was paused meanwhile.
  if ("stopped" in result) return end(result.stopped);
  if ("refused" in result) {
    if (result.refused === "AGENT_PAUSED") return end("paused");
    if (result.refused === "AGENT_STOPPED") return end("stopped");
    return end("blocked", result.refused);
  }
  trace.leadId = result.leadId;
  trace.sent = { messageIds: result.sentIds, text: result.text };
  trace.actions.push(...result.actions);
  return end("replied");
}
