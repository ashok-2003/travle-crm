// The lead's trip fields a person typed are locked for the lite turn: the customer's words never change them, and when
// the customer's newest words say otherwise, a person reconciles the lead (the turn hands over, details_changed) instead
// of the agent pricing one value while the lead keeps the other.
import type { TravelWhen } from "@travel-crm/contracts/crm";
import type { TripField } from "./lead-writes.js";

/** The lead's trip values a person typed, by field (what `typedByPerson` reads). */
export type TypedFields = Partial<Record<TripField, unknown>>;

/** The fields the turn must not change. A person's "flexible" is no date to keep: the customer's date is taken. */
export const lockedFields = (typed: TypedFields): ReadonlySet<TripField> =>
  new Set(
    (Object.keys(typed) as TripField[]).filter(
      (field) => field !== "when" || (typed.when as TravelWhen | undefined)?.kind !== "flexible",
    ),
  );

export const sameAges = (a: readonly number[], b: readonly number[]) =>
  JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** Whether a day or month said differs from the trip's time a person typed; a day inside a month typed narrows it. */
export function otherTime(when: TravelWhen, said: { day: string | null; month: string | null }): boolean {
  const month = said.month ?? said.day?.slice(0, 7) ?? null;
  if (when.kind === "dates") return said.day !== null ? said.day !== when.from : month !== when.from.slice(0, 7);
  if (when.kind === "month") return month !== null && month !== when.month;
  return false;
}
