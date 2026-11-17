// Ruling 7 (spec 3.2's last line): the act refused the booking the turn staged (the seats went, a hold was there already,
// the price changed) and rolled it back, so nothing went. With a call left and 8 seconds of the turn, the model answers
// once more on its own transcript and the app's check of what happened, with the trip's open dates and the turn's other
// actions kept; otherwise, or when that answer is refused too, the customer gets the fallback line and the team a task
// saying what wasn't done.
import { formatShortDay, parseCalendarDate } from "../../kernel/index.js";
import type { NaturalContext } from "./context/build.js";
import { cutText } from "./context/tokens.js";
import { stagedOf } from "./act-types.js";
import { fallbackLine } from "./fallback-line.js";
import { NATURAL_LIMITS, runNaturalLoop, type LoopEnd, type LoopIO, type LoopSettings } from "./loop.js";
import { CUSTOMER_FACING, without } from "./loop/ends.js";
import { appCheck } from "./loop/words.js";
import type { NaturalTraceBuilder } from "./trace.js";
import { datesOnSale } from "./trips/dates-on-sale.js";
import { actOnTurn, MONEY_ACTIONS, type LiveTurn, type TurnAct } from "./turn-act.js";
import { actAndSettle, actOfEnd, doneOf, endedOf, type TurnDone } from "./turn-done.js";
import type { StagedSet } from "./types.js";

/** The loop a turn ran, to run once more. */
export interface TurnLoop {
  context: NaturalContext;
  io: LoopIO;
  settings: LoopSettings;
  trace: NaturalTraceBuilder;
}

type FinalEnd = Extract<LoopEnd, { end: "final" }>;
interface Refused {
  refused: string;
  message: string;
}

/** Ruling 7: one more call only with this much of the turn left. */
const ONE_MORE_MS = 8_000;
/** The open dates the app check names, soonest first. */
const MOST_OPEN = 6;
const TASK_CHARS = 500;

/** The refusal's words for the model and the team: code's own sentence, lower-cased after a colon, no full stop. */
const reasonWords = (refused: Refused) => {
  const words = refused.message.trim().replace(/\.$/u, "");
  return words === "" ? refused.refused : `${words.charAt(0).toLowerCase()}${words.slice(1)}`;
};

/** The trip and party the refused booking was for: `book`'s, else the live offer's (the payment details again). */
function partyOf(turn: LiveTurn, staged: StagedSet) {
  const terms = stagedOf(staged, "book")?.terms ?? turn.prepared.facts.offer;
  if (terms === null) return null;
  return { packageId: terms.packageId, startsOn: terms.startsOn, people: terms.adults + terms.childrenAges.length };
}

/** "Sat 5 Dec, Sat 12 Dec": the trip's dates on sale now with seats for the party, read again. */
async function openDates(turn: LiveTurn, party: { packageId: string; people: number }): Promise<string> {
  const { deps, input, prepared, now } = turn;
  const { today } = prepared;
  const onSale = await deps.db.forOrg(input.organizationId, (tx) => datesOnSale(tx, [party.packageId], today, now));
  const open = (onSale.get(party.packageId)?.dates ?? [])
    .filter((one) => one.freeSeats >= party.people && one.prices !== null)
    .slice(0, MOST_OPEN)
    .map((one) => formatShortDay(one.startsOn, today));
  return open.length === 0 ? "none" : open.join(", ");
}

/** The app check the model reads before its one more call. */
async function refusalNote(turn: LiveTurn, staged: StagedSet, refused: Refused): Promise<string> {
  const party = partyOf(turn, staged);
  const open = party === null ? "" : ` Open: ${await openDates(turn, party)}.`;
  return `The seats couldn't be held: ${reasonWords(refused)}.${open} Nothing was sent; reply again.`;
}

/** The team's task: why, what the customer got and wrote, and the booking not done. */
function refusalTask(turn: LiveTurn, staged: StagedSet, refused: Refused, line: string, customerText: string): string {
  const { prepared } = turn;
  const party = partyOf(turn, staged);
  const title = prepared.sheets.find((sheet) => sheet.packageId === party?.packageId)?.title ?? "the trip";
  const wrote = customerText.trim() === "" ? "" : ` They wrote: "${cutText(customerText.replace(/\s+/gu, " "), 160)}".`;
  const booking =
    party === null
      ? ""
      : ` Not done: the booking of ${title} for ${String(party.people)} on ` +
        `${formatShortDay(parseCalendarDate(party.startsOn), prepared.today)}.`;
  return cutText(
    `The seats couldn't be held (${reasonWords(refused)}), so the customer got "${line}".${wrote}${booking}`,
    TASK_CHARS,
  );
}

/** The fallback line, the turn's own actions kept but what reaches the customer, and the team's task. */
function refusedFallback(
  turn: LiveTurn,
  loop: TurnLoop,
  end: FinalEnd,
  refused: Refused,
  customerText: string,
): Promise<TurnDone> {
  const line = fallbackLine(customerText);
  const staged = without(end.staged, CUSTOMER_FACING);
  loop.trace.staged(staged);
  const act: TurnAct = {
    messages: [line],
    staged,
    quoted: [],
    handOver: null,
    task: { kind: "question", text: refusalTask(turn, end.staged, refused, line, customerText) },
    model: null,
    fallback: `refused:${refused.refused}`,
  };
  return actAndSettle(turn, act);
}

/** After the act refused the turn's booking: one more call if one is left and there is time, else the fallback line. */
export async function afterRefusal(
  turn: LiveTurn,
  loop: TurnLoop,
  end: FinalEnd,
  refused: Refused,
  customerText: string,
): Promise<TurnDone> {
  const { context, io, settings, trace } = loop;
  const left = settings.startedMs + NATURAL_LIMITS.turnMs - io.clock();
  if (end.callsUsed >= NATURAL_LIMITS.calls || left < ONE_MORE_MS) {
    return refusedFallback(turn, loop, end, refused, customerText);
  }
  const note = await refusalNote(turn, end.staged, refused);
  const again = await runNaturalLoop(
    { ...context, messages: [...end.transcript, appCheck(note)] },
    io,
    { ...settings, forced: [...without(end.staged, MONEY_ACTIONS).values()], callsUsed: end.callsUsed },
    trace,
  );
  switch (again.end) {
    case "superseded":
      return endedOf(turn, "superseded", null);
    case "model_failed":
      return refusedFallback(turn, loop, end, refused, customerText);
    case "fallback":
      return actAndSettle(turn, actOfEnd(again));
    case "final": {
      const act = actOfEnd(again);
      const result = await actOnTurn(turn, act);
      return "refused" in result ? refusedFallback(turn, loop, again, result, customerText) : doneOf(turn, act, result);
    }
  }
}
