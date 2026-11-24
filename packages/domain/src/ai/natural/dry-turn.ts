// One natural turn as a dry run (Try it, the bench; spec 9.5): the live loop on a chat and the state the last turn handed
// back, against the agency's real data. Reads and checks run on the data, each in a transaction of its own; actions are
// staged and described, never done: nothing is sent, held, booked or stored, and only the month's AI calls count, as each
// live call does. The guards read what a live turn's would: this turn's offer and the live one, the chat lines the model
// read (Team lines of the last 30 days), the answers and each trip's text, whole for a trip get_trip read.
import { naturalFacts, type DryLead, type NaturalTestAnswer, type NaturalTestState } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { parseCalendarDate } from "../../kernel/index.js";
import { buildNaturalContext } from "./context/build.js";
import { newLinesOf } from "./context/chat-turns.js";
import { countedModel } from "./counted-model.js";
import { dryAgency, type DryAgency } from "./dry-agency.js";
import { dryAnswerOf } from "./dry-answer.js";
import { checkWords, type GuardContext } from "./guards/check-words.js";
import { runNaturalLoop, type LoopIO } from "./loop.js";
import type { NaturalPrompt } from "./prompt.js";
import { stageAction, type ActionContext } from "./tools/action-tools.js";
import { quoteFor, type ReadContext } from "./tools/read-tools.js";
import { startNaturalTrace } from "./trace.js";
import { beforeTheModel, guardReads, readTools, type FlagContext } from "./turn-reads.js";
import type { NaturalChatLine, NaturalLeadView } from "./types.js";

export interface NaturalDryTurn {
  /** The whole chat, oldest first. */
  lines: readonly NaturalChatLine[];
  /** What the last turn handed back; null starts a new chat. */
  state: NaturalTestState | null;
  now: Date;
  prompt: NaturalPrompt;
  /** Try it's own model and temperature, on every call; unset, the live agent's. */
  choice: { model?: string; temperature?: number };
}

export interface NaturalDryDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
  /** Epoch milliseconds, for the turn's time limits (Date.now unless a test sets it). */
  clock?: () => number;
}

export type { FlagContext };

/** The answer, with what the guards read at the turn's last check and what its flags read (pre-flight #13, the bench). */
export interface NaturalDryRecord {
  answer: NaturalTestAnswer;
  guardContext: GuardContext;
  flagContext: FlagContext;
}

const DRY_CHAT = "dry-run";

export const EMPTY_DRY_LEAD: DryLead = {
  packageId: null,
  day: null,
  month: null,
  adults: null,
  childrenAges: [],
  pickupCity: null,
  room: null,
  name: null,
  stage: "new",
  notes: [],
  tasks: [],
  booking: null,
};

/** The dry lead as the turn block reads it: nobody's notes, and the AI's tasks as the open ones. */
export function dryLeadView(lead: DryLead): NaturalLeadView {
  return {
    name: lead.name ?? "",
    cameFrom: "",
    packageId: lead.packageId,
    day: lead.day === null ? null : parseCalendarDate(lead.day),
    month: lead.month,
    adults: lead.adults,
    childrenAges: lead.childrenAges,
    pickupCity: lead.pickupCity,
    room: lead.room,
    stage: lead.stage,
    summary: null,
    teamNotes: [],
    openTasks: lead.tasks.map((task) => task.text),
  };
}

/** What an action's staging and checks read in a dry turn: Try it's lead and the chat as it was written. */
export function dryActionContext(input: {
  db: Database;
  organizationId: string;
  agency: DryAgency;
  state: NaturalTestState;
  labels: ReadonlyMap<string, string>;
  newLines: readonly NaturalChatLine[];
  lines: readonly NaturalChatLine[];
  now: Date;
  readContext: (tx: OrgTx) => ReadContext;
}): Omit<ActionContext, "quotedThisTurn"> {
  const { db, organizationId, agency, state, lines, now } = input;
  const { sheets, today, timeZone } = agency;
  return {
    sheets,
    labels: input.labels,
    today,
    now,
    timeZone,
    facts: state.facts,
    lead: dryLeadView(state.lead),
    lines,
    newLines: input.newLines,
    paymentReady: agency.paymentLines !== null,
    // The seats an earlier turn would have held await their advance, as the chat's own AI booking.
    booking: state.lead.booking === null ? null : { id: DRY_CHAT, awaitingPayment: true },
    profileName: null,
    quoteOf: (terms) => db.forOrg(organizationId, (tx) => quoteFor(input.readContext(tx), terms)),
    conversationId: DRY_CHAT,
    // Try it's lead has no value a person set.
    typed: {},
    lastInboundAt: lines.findLast((line) => line.from === "customer")?.at ?? now,
    adPackageId: null,
  };
}

/** The dry turn with what its guards and flags read: the bench's entry. */
export async function naturalDryTurnInFull(
  deps: NaturalDryDependencies,
  organizationId: string,
  turn: NaturalDryTurn,
): Promise<NaturalDryRecord> {
  const { db } = deps;
  const clock = deps.clock ?? Date.now;
  const startedMs = clock();
  const { now, lines } = turn;
  const agency = await dryAgency(db, organizationId, await deps.agencyName(organizationId), now);
  const { timeZone, today, sheets } = agency;
  const state = turn.state ?? { facts: naturalFacts.parse({ agent: "natural" }), lead: EMPTY_DRY_LEAD };
  const { facts } = state;
  const lead = dryLeadView(state.lead);
  const before = beforeTheModel(newLinesOf(lines, facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt)));
  const context = buildNaturalContext({
    prompt: turn.prompt,
    voice: agency.voice,
    timeZone,
    today,
    now,
    answers: agency.answers,
    contact: agency.contact,
    sheets,
    lead,
    facts,
    lines,
    cameFrom: null,
    notice: before.notice,
    withTools: before.withTools,
  });
  const reads = guardReads(agency, context.shown, facts, now);
  const readContext = (tx: OrgTx): ReadContext => ({ tx, sheets, labels: context.labels, today, now });
  const actions = dryActionContext({
    db,
    organizationId,
    agency,
    state,
    labels: context.labels,
    newLines: context.newLines,
    lines,
    now,
    readContext,
  });
  let guardContext = reads.context(new Map(), []);
  const io: LoopIO = {
    call: countedModel(deps.ai, { db, organizationId, now, timeZone }),
    read: readTools(db, organizationId, readContext, reads),
    stage: (name, args, words, quoted) => stageAction({ ...actions, quotedThisTurn: quoted }, name, args, words),
    check: (words, staged, quoted) => {
      guardContext = reads.context(staged, quoted);
      return checkWords(words, guardContext);
    },
    // Nobody writes during a dry turn.
    newerLine: () => Promise.resolve(false),
    clock,
  };
  const trace = startNaturalTrace(turn.prompt, startedMs);
  const settings = { startedMs, organizationId, ...turn.choice, forced: before.forced, flagContext: reads.flagContext };
  const end = await runNaturalLoop(context, io, settings, trace);
  const newText = context.newLines.map((line) => line.text).join("\n");
  const read = { now, today, sheets, paymentLines: agency.paymentLines, state, newText };
  return { answer: dryAnswerOf(end, read, trace, clock()), guardContext, flagContext: reads.flagContext };
}

export async function naturalDryTurn(
  deps: NaturalDryDependencies,
  organizationId: string,
  turn: NaturalDryTurn,
): Promise<NaturalTestAnswer> {
  return (await naturalDryTurnInFull(deps, organizationId, turn)).answer;
}
