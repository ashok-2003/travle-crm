// What the writing model may do this turn, decided by code: the model picks among these actions and anything else it picks
// is dropped. Money actions (payment details, a booking) need a customer who said they want to book and asked for no
// special price this turn, one open departure with seats, every traveller in a priced room, an advance, something to pay
// with, a lead, and no payment sent for it yet.
import type { ChatFacts, ReadAnswer, WriteAnswer } from "@travel-crm/contracts/ai";
import type { AutopilotRow } from "../autopilot.js";
import type { Lookup, LookupPackage } from "./lookup-types.js";
import { containsWords } from "./read-words.js";

export interface ActionContext {
  natural: boolean;
  hasLead: boolean;
  settings: Pick<AutopilotRow, "leadNotes" | "followUpTasks">;
  /** The customer's messages this turn answers (after the agency's last line): what is asked "this turn". */
  latest: string[];
  /** The places not run the chat's facts held before this turn's read: the team was told of those already. */
  notRunBefore: string[];
}

/** Whether the evidence is in a message this turn answers, not an earlier one the read saw again. */
const saidNow = (evidence: string, context: ActionContext): boolean =>
  context.latest.some((text) => containsWords(text, evidence));

export interface AllowedActions {
  /** Card keys (`P1`...) of packages with brochures to send. */
  sendFiles: string[];
  sendAgencyFiles: boolean;
  sendPayment: boolean;
  requestBooking: boolean;
  flag: true;
  handOver: true;
  note: boolean;
  task: boolean;
  /** The reason codes (comma-joined) code flags the chat for, whatever the model chose; null when there is none. */
  forcedFlag: string | null;
}

const keyOf = (index: number) => `P${String(index + 1)}`;

/**
 * The group package the booking is about: the chosen one, else the only group package in play. A chosen custom trip is
 * the team's to price and book, so nothing is.
 */
export function bookingPackage(lookup: Lookup): LookupPackage | null {
  const chosen = lookup.packages.find((one) => one.why.kind === "chosen");
  if (chosen !== undefined) return chosen.kind === "group" ? chosen : null;
  const groups = lookup.packages.filter((one) => one.kind === "group");
  return groups.length === 1 ? (groups[0] ?? null) : null;
}

/**
 * The departure the lookup priced (`chosenDeparture`: its prices, total and advance come from it). When the chat names a
 * departure id that is not that one, no money moves: the price and the departure would disagree.
 */
function knownDeparture(one: LookupPackage, facts: ChatFacts) {
  const departure = one.chosenDeparture;
  if (departure === null) return undefined;
  return facts.departureId !== null && facts.departureId !== departure.id ? undefined : departure;
}

function mayTakeMoney(lookup: Lookup, facts: ChatFacts, read: ReadAnswer, context: ActionContext): boolean {
  if (read.wants !== "book" || context.natural || !context.hasLead) return false;
  // A price only the team can give (a discount, a B2B rate) asked this turn: the team talks price first.
  if (read.special !== null && saidNow(read.special.evidence, context)) return false;
  const one = bookingPackage(lookup);
  if (one === null || facts.travellers === null) return false;
  const departure = knownDeparture(one, facts);
  if (departure === undefined || departure.freeSeats < facts.travellers) return false;
  if (facts.paymentSentFor === departure.id) return false;
  // `total` exists only when every traveller is in a priced room.
  if (one.total === null) return false;
  if (one.advancePerPersonPaise === null || one.advancePerPersonPaise <= 0) return false;
  return one.hasPaymentQr || one.hasPaymentText;
}

export function allowedActions(
  lookup: Lookup,
  facts: ChatFacts,
  read: ReadAnswer,
  context: ActionContext,
): AllowedActions {
  const wantsFiles = read.wants === "brochure" || read.wants === "information" || read.wants === "price";
  const money = mayTakeMoney(lookup, facts, read, context);
  // The read reads the whole chat, so each flag is for what is new this turn: the team hears of a place or an ask once.
  const known = new Set(context.notRunBefore.map((words) => words.trim().toLowerCase()));
  const newNotRun = read.places.some(
    (place) => place.destination === "none" && !known.has(place.words.trim().toLowerCase()),
  );
  const codes = [
    ...(newNotRun ? ["not_run"] : []),
    ...(read.special !== null && saidNow(read.special.evidence, context) ? ["special_price"] : []),
  ];
  const forcedFlag = codes.length === 0 ? null : codes.join(",");
  return {
    // A package only suggested for a place the agency doesn't run is words and a flag: its files wait until it is chosen.
    sendFiles: wantsFiles
      ? lookup.packages.flatMap((one, index) =>
          one.brochures.length > 0 && one.why.kind !== "nearest" ? [keyOf(index)] : [],
        )
      : [],
    sendAgencyFiles: read.wants === "about_agency",
    sendPayment: money,
    requestBooking: money,
    flag: true,
    handOver: true,
    note: context.settings.leadNotes,
    task: context.settings.followUpTasks,
    forcedFlag,
  };
}

/**
 * What the model picked, cut down to what code allows; the code's own flag reason comes first and the chat is flagged
 * once. Book is one action (P4-35): the payment details or the booking, either one picked, does both, or neither.
 */
export function chosenActions(asked: WriteAnswer["actions"], allowed: AllowedActions): WriteAnswer["actions"] {
  const own = asked.flag?.trim() ?? "";
  const reasons = [allowed.forcedFlag, own === "" ? null : own].filter((reason) => reason !== null);
  const money = (asked.sendPayment || asked.requestBooking) && allowed.sendPayment && allowed.requestBooking;
  return {
    sendFiles: [...new Set(asked.sendFiles.filter((key) => allowed.sendFiles.includes(key)))],
    sendAgencyFiles: asked.sendAgencyFiles && allowed.sendAgencyFiles,
    sendPayment: money,
    requestBooking: money,
    flag: reasons.length === 0 ? null : reasons.join(": "),
    handOver: asked.handOver,
    note: allowed.note ? asked.note : null,
    task: allowed.task ? asked.task : null,
  };
}
