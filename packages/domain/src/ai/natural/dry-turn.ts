// One natural turn as a dry run (Try it, the bench; spec 9.5): the live loop on a chat and the state the last turn handed
// back, against the agency's real data. Reads and checks run on the data, each in a transaction of its own; actions are
// staged and described, never done: nothing is sent, held, booked or stored, and only the month's AI calls count, as each
// live call does. The guards read what a live turn's would: this turn's offer and the live one, the chat lines the model
// read (Team lines of the last 30 days), the answers and each trip's text, whole for a trip get_trip read.
import {
  naturalFacts,
  type DryLead,
  type NaturalFacts,
  type NaturalTestAnswer,
  type NaturalTestState,
} from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { parseCalendarDate } from "../../kernel/index.js";
import { buildNaturalContext } from "./context/build.js";
import { newLinesOf } from "./context/chat-turns.js";
import { countedModel } from "./counted-model.js";
import { dryAgency, type DryAgency } from "./dry-agency.js";
import { dryAnswerOf } from "./dry-answer.js";
import { checkWords, type GuardContext, type traceFlags } from "./guards/check-words.js";
import { groundedAmounts, tripTextOf } from "./guards/grounded.js";
import { runNaturalLoop, type LoopIO } from "./loop.js";
import type { NaturalPrompt } from "./prompt.js";
import { stageAction, type ActionContext } from "./tools/action-tools.js";
import { quoteFor, runReadTool, type ReadContext } from "./tools/read-tools.js";
import { startNaturalTrace } from "./trace.js";
import { tripSheetsOf } from "./trips/trip-sheets.js";
import type { NaturalChatLine, NaturalLeadView, QuoteFigures, StagedAction, StagedSet, TripSheet } from "./types.js";

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

export type FlagContext = Parameters<typeof traceFlags>[1];

/** The answer, with what the guards read at the turn's last check and what its flags read (pre-flight #13, the bench). */
export interface NaturalDryRecord {
  answer: NaturalTestAnswer;
  guardContext: GuardContext;
  flagContext: FlagContext;
}

const DAY_MS = 86_400_000;
const TEAM_DAYS = 30;
const DRY_CHAT = "dry-run";
const PAYMENT_NOTICE = "Their screenshot went to the team to check; this chat goes to the team after your reply.";
const VOICE_NOTICE = "Their voice note couldn't be played; ask them to type what they said.";
const PAYMENT_CHECK: StagedAction = {
  tool: "hand_over",
  reason: "payment_check",
  summary: "A payment screenshot came in this chat: check it in Payments.",
};

const EMPTY_LEAD: DryLead = {
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
function leadViewOf(lead: DryLead): NaturalLeadView {
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

/**
 * Ruling 6, before the model: a payment screenshot, or a voice note nobody could play, gets one call with no tools and
 * the notice of what the app did; code hands the screenshot to the team itself. Try it posts no media; the bench does.
 */
function beforeTheModel(newLines: readonly NaturalChatLine[]) {
  if (newLines.some((line) => line.mayBePayment === true)) {
    return { notice: PAYMENT_NOTICE, withTools: false, forced: [PAYMENT_CHECK] };
  }
  if (newLines.some((line) => line.untranscribed === true))
    return { notice: VOICE_NOTICE, withTools: false, forced: [] };
  return { notice: null, withTools: true, forced: [] };
}

/**
 * What the guards and the trace's flags read: of the chat, only the lines the model read (`shown`), the Team's of the
 * last 30 days; a trip get_trip read counts whole from then on (G1 grounds its text), and G1 grounds the totals told and
 * the live offer the turn block shows.
 */
function guardReads(agency: DryAgency, shown: readonly NaturalChatLine[], facts: NaturalFacts, now: Date) {
  const { today, answers } = agency;
  const whole = new Map<string, TripSheet>();
  const sheets = () => agency.sheets.map((sheet) => whole.get(sheet.packageId) ?? sheet);
  const ownerText = () => [...Object.values(answers), ...sheets().map(tripTextOf)].join("\n");
  const since = now.getTime() - TEAM_DAYS * DAY_MS;
  const teamLines = shown.filter((line) => line.from === "team" && line.at.getTime() >= since).map((line) => line.text);
  const customerText = shown
    .filter((line) => line.from === "customer")
    .map((line) => line.text)
    .join("\n");
  // The loop's final words read it at the end of the turn, so a trip read whole updates it in place.
  const flagContext: FlagContext = { sheets: sheets(), ownerText: ownerText(), customerText, today };
  return {
    flagContext,
    async readWhole(tx: OrgTx, label: string) {
      const cut = agency.sheets.find((sheet) => sheet.label === label);
      if (cut === undefined) return;
      const [sheet] = await tripSheetsOf(tx, [{ id: cut.packageId, kind: "group" }], today, now, { whole: true });
      if (sheet === undefined) return;
      whole.set(cut.packageId, { ...sheet, label });
      flagContext.sheets = sheets();
      flagContext.ownerText = ownerText();
    },
    context(staged: StagedSet, quoted: readonly QuoteFigures[]): GuardContext {
      const offer = staged.get("offer_booking");
      return {
        grounded: groundedAmounts({
          sheets: sheets(),
          today,
          answers,
          teamLines,
          told: facts.told,
          quoted,
          liveOffer: facts.offer,
          now,
        }),
        customerText,
        offer: offer?.tool === "offer_booking" ? offer.offer : null,
        paymentConfirmed: false,
        bookingConfirmed: false,
        teamText: teamLines.join("\n"),
        ownerText: ownerText(),
        today,
      };
    },
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
  const state = turn.state ?? { facts: naturalFacts.parse({ agent: "natural" }), lead: EMPTY_LEAD };
  const { facts } = state;
  const lead = leadViewOf(state.lead);
  const before = beforeTheModel(newLinesOf(lines, facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt)));
  const context = buildNaturalContext({
    prompt: turn.prompt,
    voice: agency.voice,
    timeZone,
    today,
    now,
    answers: agency.answers,
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
  const actions: Omit<ActionContext, "quotedThisTurn"> = {
    sheets,
    labels: context.labels,
    today,
    now,
    timeZone,
    facts,
    lead,
    lines,
    newLines: context.newLines,
    paymentReady: agency.paymentLines !== null,
    // The seats an earlier turn would have held await their advance, as the chat's own AI booking.
    booking: state.lead.booking === null ? null : { id: DRY_CHAT, awaitingPayment: true },
    profileName: null,
    quoteOf: (terms) => db.forOrg(organizationId, (tx) => quoteFor(readContext(tx), terms)),
    conversationId: DRY_CHAT,
    // Try it's lead has no value a person set.
    typed: {},
    lastInboundAt: lines.findLast((line) => line.from === "customer")?.at ?? now,
    adPackageId: null,
  };
  let guardContext = reads.context(new Map(), []);
  const io: LoopIO = {
    call: countedModel(deps.ai, { db, organizationId, now, timeZone }),
    read: (name, args) =>
      db.forOrg(organizationId, async (tx) => {
        const answer = await runReadTool(readContext(tx), name, args);
        const label = args.trip_id;
        if (name === "get_trip" && typeof label === "string" && !answer.result.startsWith("refused:")) {
          await reads.readWhole(tx, label);
        }
        return answer;
      }),
    stage: (name, args, words, quoted) => stageAction({ ...actions, quotedThisTurn: quoted }, name, args, words),
    check: (words, staged, quoted) => {
      guardContext = reads.context(staged, quoted);
      return checkWords(words, guardContext);
    },
    // Nobody writes during a dry turn.
    newerLine: () => Promise.resolve(false),
    clock,
  };
  const trace = startNaturalTrace(turn.prompt.version, startedMs);
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
