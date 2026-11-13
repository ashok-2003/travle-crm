// The lite agent's decide step (spec Step 5): settles the facts, takes one move from the table, holds its question to
// the loop guard (T3), and says what the move does to the lead: the stage, a note, a task, a suggestion.
import { checklistItems, type ChecklistItem, type LiteFacts, type LiteIntent } from "@travel-crm/contracts/ai";
import type { Decision, DepartureLine, Move, Situation, SituationPackage } from "../types.js";
import type { DecideContext, DecideInput, Picked, Quote } from "./context.js";
import { choicesFor, nextAsk } from "./moves.js";
import { pickMove } from "./rules.js";
import { saleStageOf } from "./stage.js";

export type { DecideInput, Quote } from "./context.js";

/** What answers each checklist item, so a turn that changed it has answered it. */
const answerOf: Record<ChecklistItem, (facts: LiteFacts) => unknown> = {
  name: (facts) => facts.name,
  where: (facts) => [facts.packageId, facts.placeWords],
  when: (facts) => [facts.day, facts.month],
  people: (facts) => [facts.adults, facts.children?.count ?? null],
  children_ages: (facts) => facts.children?.ages ?? null,
  pickup: (facts) => facts.pickupCity,
  room: (facts) => facts.roomType,
  full_name: (facts) => facts.name,
};
const answered = (item: ChecklistItem, before: LiteFacts, after: LiteFacts) =>
  JSON.stringify(answerOf[item](before)) !== JSON.stringify(answerOf[item](after));

const packageIn = (situation: Situation, facts: LiteFacts): SituationPackage | null =>
  situation.package?.id === facts.packageId ? situation.package : null;

/**
 * A package that left the index let go, N1, the departure on the day they gave, and a name asked twice without an
 * answer let go (K1, T3).
 */
function settled(input: DecideInput): LiteFacts {
  const facts = { ...input.facts };
  // A package no longer sold is never named or walked through again: the chat goes back to asking where.
  if (facts.packageId !== null && !input.index.some((entry) => entry.id === facts.packageId)) {
    Object.assign(facts, { packageId: null, departureId: null, quoted: null });
  }
  const fromAd = input.index.find((entry) => entry.id === input.adPackageId);
  // The ad opens the chat with its package, unless the customer's first words already named a trip or a place.
  const opening = facts.lastMove === null && facts.packageId === null && facts.placeWords === null;
  if (opening && fromAd !== undefined) facts.packageId = fromAd.id;
  const day = facts.day;
  if (facts.departureId === null && day !== null) {
    facts.departureId = packageIn(input.situation, facts)?.departures.find((one) => one.startsOn === day)?.id ?? null;
  }
  const last = input.before.asked[0];
  if (last?.item === "name" && last.times >= 2 && !answered("name", input.before, facts)) facts.nameSkipped = true;
  return facts;
}

/**
 * The facts' departure with its free seats, as the price read it (the package's list stops at 20). One settled from
 * the day this turn was read before it was chosen, so it comes from the package's list, where it was found. Else null:
 * it is no longer open, and not bookable.
 */
function departureOf(input: DecideInput, facts: LiteFacts, pkg: SituationPackage | null): DepartureLine | null {
  const price = input.situation.price;
  if (facts.departureId === null) return null;
  if (price?.packageId === facts.packageId && price.departure?.id === facts.departureId) return price.departure;
  const settledNow = input.facts.departureId === null;
  return settledNow ? (pkg?.departures.find((one) => one.id === facts.departureId) ?? null) : null;
}

/** The total and advance for exactly these facts' package and departure; a price read for other facts gives none. */
function quoteOf(situation: Situation, facts: LiteFacts): Quote | null {
  const price = situation.price;
  const departureId = facts.departureId;
  if (price?.packageId !== facts.packageId || departureId === null || price.departure?.id !== departureId) return null;
  if (price.totalPaise === null || price.advancePaise === null) return null;
  return { departureId, totalPaise: price.totalPaise, advancePaise: price.advancePaise };
}

const sameQuote = (told: Quote, now: Quote | null) =>
  now !== null &&
  told.departureId === now.departureId &&
  told.totalPaise === now.totalPaise &&
  told.advancePaise === now.advancePaise;

function intentsOf(input: DecideInput): ReadonlySet<LiteIntent> {
  const names = input.checked?.form.intents.map((intent) => intent.name) ?? [];
  // A bare "ok" that still gave a detail (a "yes" to "did you mean Kedarnath?") is answered as the detail, never silence.
  const gave = names.includes("ok_thanks") && checklistItems.some((item) => answered(item, input.before, input.facts));
  return new Set<LiteIntent>(gave ? [...names, "gives_details"] : names);
}

/**
 * The checklist item a move leaves waiting: an ask_detail's, the question a reply ends with, or, for the moves that ask
 * which trip (a greeting, "did you mean", the other trips, "we don't run that"), where; the next item once one is picked.
 */
function itemAsked(move: Move, context: DecideContext): ChecklistItem | null {
  if (move.kind === "ask_detail") return move.item;
  if ("ask" in move) return move.ask;
  const notRun = move.kind === "fixed" && move.text === "not_run";
  const whichTrip =
    notRun || move.kind === "greet" || move.kind === "confirm_place" || move.kind === "show_other_trips";
  if (!whichTrip) return null;
  return context.facts.packageId === null ? "where" : nextAsk(context);
}

/** T3: a question asked twice without an answer is asked with choices the third time; then a person takes it. */
function loopGuarded(picked: Picked, context: DecideContext): { picked: Picked; asked: LiteFacts["asked"] } {
  const item = itemAsked(picked.move, context);
  if (item === null) return { picked, asked: [] };
  const { before } = context.input;
  const last = before.asked[0];
  const times = last?.item === item && !answered(item, before, context.facts) ? last.times + 1 : 1;
  if (times < 3) return { picked, asked: [{ item, times }] };
  const choices = times === 3 ? choicesFor(item, context) : [];
  const why = `loop:${item}`;
  if (choices.length > 0)
    return { picked: { ...picked, move: { kind: "ask_detail", item, choices }, why }, asked: [{ item, times }] };
  return { picked: { ...picked, move: { kind: "hand_over", reason: "loop" }, why }, asked: [] };
}

const fullPrice = (move: Move) => move.kind === "give_price" && move.price === "full";

/** One note: the rule's own, else a hand-over's, else a new package's (it sends the brochure), else a price's. */
function noteOf(picked: Picked, facts: LiteFacts, before: LiteFacts): Decision["note"] {
  const { move } = picked;
  if (picked.note !== undefined) return picked.note;
  if (move.kind === "hand_over") return "handed_over";
  if (move.kind !== "silent" && facts.packageId !== null && facts.packageId !== before.packageId)
    return "package_picked";
  return fullPrice(move) ? "quoted" : null;
}

/** Forward only, and only for a message sent: a full price moves New or Contacted to Quote sent, any other New to Contacted. */
export function stageToOf(move: Move, leadStage: DecideInput["leadStage"]): Decision["stageTo"] {
  if (move.kind === "silent") return null;
  if (fullPrice(move) && (leadStage === "new" || leadStage === "contacted")) return "quote_sent";
  return leadStage === "new" ? "contacted" : null;
}

export function decide(input: DecideInput): Decision {
  const facts = settled(input);
  const pkg = packageIn(input.situation, facts);
  const quote = quoteOf(input.situation, facts);
  // A total told for other facts (a room changed since) is no quote: the sale is not Quoted on it, and a price or a
  // booking from here records today's total, which is the one the booking is held to.
  if (facts.quoted !== null && !sameQuote(facts.quoted, quote)) facts.quoted = null;
  const stage = saleStageOf(facts, input.openBooking, pkg);
  // Only a customer's words are decided on: anything else stays quiet and keeps the facts as they were.
  if (input.kind !== "reply") {
    const quiet = { move: { kind: "silent" as const }, stage, why: "silence", facts: input.facts };
    return { ...quiet, stopFollowUps: false, note: null, task: null, stageTo: null, suggest: null };
  }
  const price = input.situation.price;
  const from = price?.packageId === facts.packageId && (price.fromPaise !== null || price.perPersonPaise !== null);
  const priced = quote !== null || from;
  const departure = departureOf(input, facts, pkg);
  const context: DecideContext = { input, intents: intentsOf(input), facts, pkg, departure, quote, priced, stage };
  const { picked, asked } = loopGuarded(pickMove(context), context);
  const { move } = picked;
  const next: LiteFacts = { ...facts, otherInARow: 0, ...picked.facts, asked, lastMove: move.kind };
  if (fullPrice(move) || move.kind === "book") next.quoted = quote;
  return {
    move,
    stage,
    why: picked.why,
    facts: next,
    stopFollowUps: picked.stopFollowUps ?? false,
    note: noteOf(picked, next, input.before),
    task: picked.task ?? null,
    stageTo: stageToOf(move, input.leadStage),
    suggest: picked.suggest ?? null,
  };
}
