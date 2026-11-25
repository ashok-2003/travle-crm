// Ruling 7 (spec 3.2's last line): the act refused the booking the turn staged (the seats went, a hold was there already,
// the price changed) and rolled it back, so nothing went: the app's check of what happened for the model's one more
// answer, and the act when nothing goes to the customer and the team gets a task saying what wasn't done (the owner,
// 2026-11-24: no automatic holding line).
import { formatShortDay, parseCalendarDate } from "../../kernel/index.js";
import { cutText } from "./context/tokens.js";
import { stagedOf } from "./act-types.js";
import { CUSTOMER_FACING, without } from "./loop/ends.js";
import { datesOnSale } from "./trips/dates-on-sale.js";
import type { LiveTurn, TurnAct } from "./turn-act.js";
import type { StagedSet } from "./types.js";

export interface Refused {
  refused: string;
  message: string;
}

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
export async function refusalNote(turn: LiveTurn, staged: StagedSet, refused: Refused): Promise<string> {
  const party = partyOf(turn, staged);
  const open = party === null ? "" : ` Open: ${await openDates(turn, party)}.`;
  return `The seats couldn't be held: ${reasonWords(refused)}.${open} Nothing was sent; reply again.`;
}

/** The team's task: why, what the customer wrote, and the booking not done. */
function refusalTask(turn: LiveTurn, staged: StagedSet, refused: Refused, customerText: string): string {
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
    `The seats couldn't be held (${reasonWords(refused)}), so nothing went to the customer.${wrote}${booking}`,
    TASK_CHARS,
  );
}

/** Nothing to the customer, the turn's own actions kept but what reaches the customer, and the team's task. */
export function refusedAct(turn: LiveTurn, staged: StagedSet, refused: Refused, customerText: string): TurnAct {
  return {
    messages: [],
    staged: without(staged, CUSTOMER_FACING),
    quoted: [],
    handOver: null,
    task: { kind: "question", text: refusalTask(turn, staged, refused, customerText) },
    model: null,
    fallback: `refused:${refused.refused}`,
  };
}
