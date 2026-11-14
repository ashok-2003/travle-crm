// "Try it" for an agency on the lite agent: one turn of the live lite path (understand, check, merge, look up, decide,
// write, fold) as a dry run on the test chat the owner typed, as if a customer wrote it in a chat with no lead. The facts
// and summary the last turn left come back with the chat; the turn hands back the next ones and a trace of why. A model
// and a temperature the chat chose go on both its model calls; the live turn never sets either. Nothing is sent, held,
// booked or kept; only the month's usage is written, since each model call counts against the limit as a turn's do.
// Setup need not be finished.
import { liteFacts, type TestAiAnswer, type TestAiInput, type TestAiState } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import type { AiModel, AiRequest } from "@travel-crm/integrations/ai";
import type { MemberAccess } from "../../identity/index.js";
import { actingOn, codeWordsOf } from "./act-reply.js";
import { countedCall, type CallEnvironment } from "./counted-call.js";
import { answerOf, blocked, ended } from "./dry-run-answer.js";
import { dryRunAgency, dryRunChat } from "./dry-run-setup.js";
import { checkedForm } from "./form-check.js";
import { mergeForm } from "./merge.js";
import { startingFacts } from "./prepare.js";
import { understandRequest } from "./prompts/understand-prompt.js";
import { decideBase } from "./turn.js";
import { decided, written } from "./turn-steps.js";
import { writeTries } from "./turn-trace.js";
import type { Decision } from "./types.js";
import { understandChat } from "./understand.js";

/** The test chat's own model and temperature, on every model call; unset, the call is the live turn's. */
export type DryRunChoice = Pick<AiRequest, "model" | "temperature">;

/** The model as the test chat asks it: its choice put on each request, and each answer's model noted in the trace. */
function chosen(ai: AiModel, choice: DryRunChoice, trace: TestAiAnswer["trace"]): AiModel {
  // Only what was chosen: a request with no temperature key keeps the model's own.
  const wanted = {
    ...(choice.model === undefined ? {} : { model: choice.model }),
    ...(choice.temperature === undefined ? {} : { temperature: choice.temperature }),
  };
  return {
    configured: ai.configured,
    complete: async (request) => {
      const result = await ai.complete({ ...request, ...wanted });
      if (result.ok) trace.model = result.model;
      return result;
    },
  };
}

/** The trace's account of a decision: its move, stage and why, and a hand-over's reason. */
const decisionTrace = ({ move, stage, why }: Decision) => ({
  move: move.kind,
  stage,
  why,
  handOver: move.kind === "hand_over" ? move.reason : null,
});

export async function liteDryRun(
  deps: { db: Database; ai: AiModel; agencyName: (organizationId: string) => Promise<string> },
  access: MemberAccess,
  chat: Pick<TestAiInput, "messages" | "state"> & DryRunChoice,
  now: Date,
): Promise<TestAiAnswer> {
  const { db } = deps;
  const { organizationId } = access;
  const agencyName = await deps.agencyName(organizationId);
  const agency = await dryRunAgency(db, organizationId, now);
  const { index, today, timeZone } = agency;
  const { messages, burst, sent } = dryRunChat(chat.messages, now);
  const facts = startingFacts(chat.state?.facts ?? liteFacts.parse({ agent: "lite" }), index, null);
  // What a turn that sends nothing leaves: the state as it came, so the next turn reads the chat afresh.
  const kept: TestAiState = { facts, summary: chat.state?.summary ?? "" };
  const trace: TestAiAnswer["trace"] = {
    model: null,
    intents: [],
    move: null,
    stage: null,
    why: null,
    lookups: [],
    checks: [],
    writes: [],
    handOver: null,
  };
  const ai = chosen(deps.ai, chat, trace);
  const environment: CallEnvironment = { db, organizationId, now, timeZone };
  const asking = understandRequest({
    agencyName,
    packages: index,
    now,
    today,
    timeZone,
    lead: null,
    summary: kept.summary,
    timeline: [],
    messages,
  });
  const asked = await countedCall(environment, () => understandChat(ai, asking.request));
  if (!asked.ok) return asked.reason === "unfit" ? blocked("unfit", kept, trace) : ended(asked.reason);
  const checked = checkedForm(asked.form, messages, burst, index, today);
  const merged = mergeForm(facts, checked, index);
  trace.intents = checked.form.intents.map((intent) => intent.name);
  trace.checks = checked.dropped.map((code) => ({ name: "proof", passed: false, detail: code }));

  const base = decideBase(
    {
      burst,
      facts,
      index,
      adPackageId: null,
      openBooking: null,
      hasBooking: false,
      mayBePayment: false,
      nameUsable: false,
      leadStage: null,
      places: agency.places,
    },
    { organizationId, conversationId: "dry-run", kind: "reply", token: "dry-run" },
    checked,
    merged,
  );
  const { situation, decision } = await decided(
    db,
    organizationId,
    base,
    { index, answers: agency.answers, facts: merged, today, now },
    checked.form.lookups,
  );
  trace.lookups = situation.looked;
  Object.assign(trace, decisionTrace(decision));

  const words = await written(
    ai,
    environment,
    { ...agency, messages, sent },
    { decision, situation, agencyName, summary: checked.form.summary },
  );
  if (words !== null) trace.writes = writeTries(words.written);
  if (words?.written.kind === "refused") return blocked(words.written.code, kept, trace);
  const code = codeWordsOf(decision, situation, decision.facts.language, agencyName, today);
  const acting = actingOn(decision, code, words?.written ?? null);
  if ("ended" in acting) return ended(acting.ended);
  Object.assign(trace, decisionTrace(acting.decision));
  return answerOf(
    db,
    organizationId,
    { decision: acting.decision, reply: acting.reply, situation, now, agency },
    { kept, next: { facts: acting.decision.facts, summary: checked.form.summary }, trace },
  );
}
