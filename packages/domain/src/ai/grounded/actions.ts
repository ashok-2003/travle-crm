// What the writing model may do this turn, decided by code: the model picks among these actions and anything else it picks
// is dropped. Money actions (payment details, a booking) need a customer who said they want to book, one open departure
// with seats, every traveller in a priced room, an advance, something to pay with, a lead, and no payment sent for it yet.
import type { ChatFacts, ReadAnswer, WriteAnswer } from "@travel-crm/contracts/ai";
import type { AutopilotRow } from "../autopilot.js";
import type { Lookup, LookupPackage } from "./lookup-types.js";

export interface ActionContext {
  natural: boolean;
  hasLead: boolean;
  settings: Pick<AutopilotRow, "leadNotes" | "followUpTasks">;
}

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
  /** The reason code code flags the chat for, whatever the model chose; null when there is none. */
  forcedFlag: "not_run" | "special_price" | null;
}

const keyOf = (index: number) => `P${String(index + 1)}`;

/** The group package the booking is about: the chosen one, else the only group package in play. */
function bookingPackage(lookup: Lookup): LookupPackage | null {
  const groups = lookup.packages.filter((one) => one.kind === "group");
  return groups.find((one) => one.why.kind === "chosen") ?? (groups.length === 1 ? (groups[0] ?? null) : null);
}

/** The package's departure the chat settled on: by the chat's departure id, else by the asked day. */
function knownDeparture(one: LookupPackage, facts: ChatFacts) {
  const all = [...(one.chosenDeparture === null ? [] : [one.chosenDeparture]), ...one.departures];
  const byId = facts.departureId === null ? undefined : all.find((departure) => departure.id === facts.departureId);
  if (byId !== undefined) return byId;
  if (facts.departureId !== null) return undefined;
  return facts.startsOn === null ? undefined : all.find((departure) => departure.startsOn === facts.startsOn);
}

function mayTakeMoney(lookup: Lookup, facts: ChatFacts, read: ReadAnswer, context: ActionContext): boolean {
  if (read.wants !== "book" || context.natural || !context.hasLead) return false;
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
  const forcedFlag = read.places.some((place) => place.destination === "none")
    ? "not_run"
    : read.special !== null
      ? "special_price"
      : null;
  return {
    sendFiles: wantsFiles
      ? lookup.packages.flatMap((one, index) => (one.brochures.length > 0 ? [keyOf(index)] : []))
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

/** What the model picked, cut down to what code allows; the code's own flag reason comes first and the chat is flagged once. */
export function chosenActions(asked: WriteAnswer["actions"], allowed: AllowedActions): WriteAnswer["actions"] {
  const own = asked.flag?.trim() ?? "";
  const reasons = [allowed.forcedFlag, own === "" ? null : own].filter((reason) => reason !== null);
  return {
    sendFiles: [...new Set(asked.sendFiles.filter((key) => allowed.sendFiles.includes(key)))],
    sendAgencyFiles: asked.sendAgencyFiles && allowed.sendAgencyFiles,
    sendPayment: asked.sendPayment && allowed.sendPayment,
    requestBooking: asked.requestBooking && allowed.requestBooking,
    flag: reasons.length === 0 ? null : reasons.join(": "),
    handOver: asked.handOver,
    note: allowed.note ? asked.note : null,
    task: allowed.task ? asked.task : null,
  };
}
