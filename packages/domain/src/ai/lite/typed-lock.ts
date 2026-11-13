// The lead's trip fields a person typed are locked for the lite turn: the customer's words never change them, and when
// the customer's newest words say otherwise, a person reconciles the lead (the turn hands over, details_changed) instead
// of the agent pricing one value while the lead keeps the other.
import type { TravelWhen } from "@travel-crm/contracts/crm";
import { containsWords, hasAWord, normalised } from "../grounded/read-words.js";
import type { TripField } from "./lead-writes.js";
import type { CheckedForm, ContextMessage } from "./types.js";

/** The lead's trip values a person typed, by field (what `typedByPerson` reads). */
export type TypedFields = Partial<Record<TripField, unknown>>;

/** The fields the turn must not change. */
export const lockedFields = (typed: TypedFields): ReadonlySet<TripField> => new Set(Object.keys(typed) as TripField[]);

const sameWords = (a: string, b: string) =>
  normalised(a) === normalised(b) || containsWords(a, b) || containsWords(b, a);
const sameAges = (a: readonly number[], b: readonly number[]) =>
  JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** Whether a day or month said differs from the trip's time a person typed; a day inside a month typed narrows it. */
function otherTime(when: TravelWhen, said: { day: string | null; month: string | null }): boolean {
  const month = said.month ?? said.day?.slice(0, 7) ?? null;
  if (when.kind === "dates") return said.day !== null ? said.day !== when.from : month !== when.from.slice(0, 7);
  if (when.kind === "month") return month !== null && month !== when.month;
  return false;
}

/**
 * The person-typed fields the customer's newest words (said since our last message, `burst`) contradict. Older lines
 * are history the person already weighed when they typed the value.
 */
export function typedChanged(checked: CheckedForm, typed: TypedFields, burst: readonly ContextMessage[]): TripField[] {
  const lines = burst.filter((line) => line.from === "customer");
  const saidNow = (proof: string) => hasAWord(proof) && lines.some((line) => containsWords(line.text, proof));
  const { details } = checked.form;
  const changed: TripField[] = [];
  if (typed.adults !== undefined && details.adults && saidNow(details.adults.proof)) {
    if (details.adults.count !== typed.adults) changed.push("adults");
  }
  const ages = typed.children_ages as number[] | undefined;
  if (ages !== undefined && details.children && saidNow(details.children.proof)) {
    const { count, ages: said } = details.children;
    if (count !== ages.length || (said.length > 0 && !sameAges(said, ages))) changed.push("children_ages");
  }
  const when = typed.when as TravelWhen | undefined;
  if (when !== undefined && details.date && saidNow(details.date.proof) && otherTime(when, details.date)) {
    changed.push("when");
  }
  const city = typed.departure_city as string | undefined;
  if (city !== undefined && details.pickup_city && saidNow(details.pickup_city.proof)) {
    if (!sameWords(details.pickup_city.words, city)) changed.push("departure_city");
  }
  if (typed.room_type !== undefined && details.room && saidNow(details.room.proof)) {
    if (details.room.type !== typed.room_type) changed.push("room_type");
  }
  return changed;
}
