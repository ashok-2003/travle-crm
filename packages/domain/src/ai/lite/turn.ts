// The lite agent's turn (plan 3a): UNDERSTAND the chat into a checked form (one model call), LOOK UP and DECIDE the move
// in code, WRITE its words with blanks code fills and checks (the second model call, only for the moves that need
// words), then ACT in one transaction. Both calls count against the month's limit. A voice note, or a customer who has
// a booking already, goes to a person with no model call. Whatever stops the turn sends nothing; a refusal tells the
// team. One log line of codes ends every turn, and a prepared turn's trace goes to the sink.
import { isAQuestion, sentencesIn } from "../grounded/read-words.js";
import { countedCall, type CallEnvironment } from "../grounded/turn-calls.js";
import { flagChat } from "../grounded/turn-flag.js";
import { actingOn, codeWordsOf } from "./act-reply.js";
import { checkedForm } from "./form-check.js";
import { mergeForm } from "./merge.js";
import { lockedFields, typedChanged } from "./typed-lock.js";
import { prepareLiteTurn, type LitePrepared } from "./prepare.js";
import { understandRequest } from "./prompts/understand-prompt.js";
import { finishTurn, startTrace, tallied, withoutMessages, writeChecks, type TurnLog } from "./turn-trace.js";
import { acted, decided, written } from "./turn-steps.js";
import type { DecideInput } from "./decide/decide.js";
import type { CheckedForm, LiteDependencies, LiteOutcome, LiteTurnInput } from "./types.js";
import { understandChat } from "./understand.js";

export async function runLiteTurn(deps: LiteDependencies, input: LiteTurnInput, now: Date): Promise<LiteOutcome> {
  const startedMs = Date.now();
  // Plan 3b writes the nudges; until then a quiet chat is left quiet, before any read (a follow-up time left on a chat
  // still brings its nudge here). A follow-up task the owner set is a person's call to make.
  if (input.kind !== "reply") {
    const outcome = input.kind === "followUp" ? "off" : "nothing";
    return finishTurn(deps, input, { outcome, log: {}, startedMs }, null);
  }
  const prepared = await prepareLiteTurn(deps, input, now);
  if (typeof prepared === "string") return finishTurn(deps, input, { outcome: prepared, log: {}, startedMs }, null);
  const trace = startTrace(input, prepared.leadId, now);
  const log: TurnLog = {};
  const end = (outcome: LiteOutcome, reason?: string) =>
    finishTurn(
      deps,
      input,
      { outcome, log: { ...log, ...(reason === undefined ? {} : { reason }) }, startedMs },
      trace,
    );
  const { organizationId } = input;
  const ai = tallied(deps.ai, trace);
  const environment: CallEnvironment = { db: deps.db, organizationId, now, timeZone: prepared.timeZone };
  /** Sends nothing and tells the team, with a code and never the customer's words. */
  const flag = async (outcome: "unfit" | "blocked", code: string) => {
    await flagChat(deps.db, { organizationId, chat: prepared.chat, token: input.token, code, facts: null, now });
    return end(outcome, code);
  };
  const agencyName = await deps.agencyName(organizationId);

  // UNDERSTAND, unless the turn goes to a person whatever was said.
  let checked: CheckedForm | null = null;
  let facts = prepared.facts;
  /** The person-typed lead fields the customer now contradicts: a person reconciles them. */
  let changed: string[] = [];
  const kinds = prepared.burst.map((one) => one.kind);
  if (!kinds.includes("audio") && !prepared.hasBooking) {
    const asking = understandRequest({
      agencyName,
      packages: prepared.index,
      now,
      today: prepared.today,
      timeZone: prepared.timeZone,
      lead: prepared.card,
      summary: prepared.summary,
      timeline: prepared.timeline,
      messages: prepared.messages,
    });
    trace.messageIds = asking.messageIds;
    const asked = await countedCall(environment, () => understandChat(ai, asking.request));
    trace.understand = { blocks: withoutMessages(asking.blocks), raw: "raw" in asked ? asked.raw : null };
    // Nothing usable: the facts stay as they were, so the next turn reads the chat afresh.
    if (!asked.ok) return asked.reason === "unfit" ? flag("unfit", "unfit") : end(asked.reason);
    checked = checkedForm(asked.form, prepared.messages, prepared.burst, prepared.index, prepared.today);
    facts = mergeForm(prepared.facts, checked, prepared.index, lockedFields(prepared.typed));
    changed = typedChanged(checked, prepared.typed, prepared.burst);
    log.intents = trace.intents = checked.form.intents.map((intent) => intent.name);
    trace.checks.push(...checked.dropped.map((code) => ({ name: "proof", passed: false, detail: code })));
    trace.checks.push(...changed.map((field) => ({ name: "typed", passed: false, detail: field })));
  }

  // LOOK UP and DECIDE.
  const { situation, decision } = await decided(
    deps.db,
    organizationId,
    decideBase(prepared, input, checked, facts, changed.length > 0),
    { index: prepared.index, answers: prepared.answers, facts, today: prepared.today, now },
    checked?.form.lookups ?? [],
  );
  log.lookups = situation.looked.length;
  trace.lookups = situation.looked;

  // WRITE, then fold the words with code's own: no safe words hand the chat over.
  const words = await written(ai, environment, prepared, {
    decision,
    situation,
    agencyName,
    summary: checked?.form.summary ?? prepared.summary,
  });
  if (words !== null) {
    trace.write = { blocks: words.blocks, raw: words.written.raw };
    trace.checks.push(...writeChecks(words.written));
  }
  const code = codeWordsOf(decision, situation, decision.facts.language, agencyName, prepared.today);
  const acting = actingOn(decision, code, words?.written ?? null);
  if ("ended" in acting) return end(acting.ended);
  const { move } = acting.decision;
  log.move = trace.move = move.kind;
  trace.stage = acting.decision.stage;
  trace.why = acting.decision.why;
  trace.note = acting.decision.note;
  trace.task = acting.decision.task;
  trace.suggest = acting.decision.suggest;

  // ACT.
  const result = await acted(deps, prepared.supplierStateCode, {
    organizationId,
    conversationId: prepared.chat.id,
    token: input.token,
    kind: input.kind,
    now,
    today: prepared.today,
    timeZone: prepared.timeZone,
    decision: acting.decision,
    language: acting.decision.facts.language,
    reply: acting.reply,
    situation,
    checked,
    model: trace.model,
    agencyName,
  });
  if (result === "already") return end("answered");
  // A person replied or took the chat over, or a switch went off, while the model worked: quietly, nothing was written.
  if ("stopped" in result) return end(result.stopped);
  if ("refused" in result) {
    if (result.refused === "AGENT_PAUSED") return end("paused");
    if (result.refused === "NEWER_MESSAGE") return end("superseded");
    return flag("blocked", result.refused);
  }
  trace.leadId = result.leadId;
  trace.sent = { messageIds: result.sentIds, text: result.text };
  trace.actions = result.actions;
  if (result.handedOver) return end("handed_off", move.kind === "hand_over" ? move.reason : "unanswered");
  return end(move.kind === "silent" ? "silent" : "replied");
}

export function decideBase(
  prepared: Pick<
    LitePrepared,
    | "burst"
    | "facts"
    | "index"
    | "adPackageId"
    | "openBooking"
    | "hasBooking"
    | "mayBePayment"
    | "nameUsable"
    | "leadStage"
    | "places"
  >,
  input: LiteTurnInput,
  checked: CheckedForm | null,
  facts: LitePrepared["facts"],
  detailsChanged = false,
): Omit<DecideInput, "situation"> {
  return {
    kind: input.kind,
    checked,
    before: prepared.facts,
    facts,
    burst: {
      kinds: prepared.burst.map((one) => one.kind),
      question: prepared.burst.some((one) => sentencesIn(one.text).some(isAQuestion)),
    },
    index: prepared.index,
    adPackageId: prepared.adPackageId,
    openBooking: prepared.openBooking,
    hasBooking: prepared.hasBooking,
    detailsChanged,
    mayBePayment: prepared.mayBePayment,
    nameUsable: prepared.nameUsable,
    leadStage: prepared.leadStage,
    places: prepared.places,
  };
}
