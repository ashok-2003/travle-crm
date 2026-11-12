// The moves the table's rules share: asking a detail, dates near what was asked, the price, a hand-over, a fixed line,
// and the loop guard's choices.
import type { ChecklistItem, LiteFacts } from "@travel-crm/contracts/ai";
import type { DepartureLine, HandOverReason, Move, SituationPackage } from "../types.js";
import type { DecideContext, Picked } from "./context.js";

const MOST_SHOWN = 3;
type FixedLine = Extract<Move, { kind: "fixed" }>["text"];
interface Near {
  day: string | null;
  month: string | null;
}

export const handOver = (reason: HandOverReason, why: string): Picked => ({ move: { kind: "hand_over", reason }, why });
export const fixedLine = (text: FixedLine, why: string): Picked => ({ move: { kind: "fixed", text }, why });

/** Seats the party needs: one while the count is unknown. */
export const seatsFor = (facts: LiteFacts): number =>
  facts.adults === null ? 1 : facts.adults + (facts.children?.count ?? 0);

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Up to 3 departures with seats for the party, by date: in the month asked, else nearest the day or month, else the soonest. */
export function datesNear(pkg: SituationPackage, seats: number, near: Near): DepartureLine[] {
  const open = pkg.departures.filter((one) => one.freeSeats >= seats);
  const { day, month } = near;
  const inMonth = day === null && month !== null ? open.filter((one) => one.startsOn.startsWith(month)) : [];
  const target = day ?? (month === null ? null : `${month}-01`);
  const away = (one: DepartureLine) => (target === null ? 0 : Math.abs(dayNumber(one.startsOn) - dayNumber(target)));
  const nearest = inMonth.length > 0 ? inMonth : [...open].sort((a, b) => away(a) - away(b));
  return nearest.slice(0, MOST_SHOWN).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** The package's dates near `near`; with no date that has the party's seats, the question is a person's. */
export function datesMove(
  context: DecideContext,
  near: Near,
  ask: ChecklistItem | null,
  why: string,
  facts: Partial<LiteFacts> = {},
): Picked {
  const { pkg } = context;
  const dates = pkg === null ? [] : datesNear(pkg, seatsFor(context.facts), near);
  if (pkg === null || dates.length === 0) return { ...handOver("unanswered", why), facts };
  return { move: { kind: "give_dates", packageId: pkg.id, departureIds: dates.map((one) => one.id), ask }, why, facts };
}

/** Asks one item. "When" from someone who gave a month, or a day with no departure, offers that time's dates instead. */
export function askMove(context: DecideContext, item: ChecklistItem): Picked {
  const { facts, pkg } = context;
  const why = `checklist:${item}`;
  if (item === "when" && pkg !== null && (facts.month !== null || facts.day !== null)) {
    return datesMove(context, { day: facts.day, month: facts.month }, "when", why);
  }
  return { move: { kind: "ask_detail", item, choices: [] }, why };
}

/** The price: the total for the settled facts when there is one, else "from"; with no price at all, a person answers. */
export function priceMove(context: DecideContext, ask: ChecklistItem | null, why: string): Picked {
  const packageId = context.facts.packageId;
  if (packageId === null || !context.priced) return handOver("unanswered", why);
  return { move: { kind: "give_price", packageId, price: context.quote === null ? "from" : "full", ask }, why };
}

/**
 * The loop guard's choices for an item's third ask: values for code to word (titles, YYYY-MM-DD days, room types).
 * None for the name, the children's ages and the full name: there is no fair list of those.
 */
export function choicesFor(item: ChecklistItem, context: DecideContext): string[] {
  const { facts, pkg } = context;
  if (item === "where") return context.input.index.slice(0, MOST_SHOWN).map((entry) => entry.title);
  if (item === "when") {
    return pkg === null ? [] : datesNear(pkg, seatsFor(facts), facts).map((one) => one.startsOn);
  }
  if (item === "people") return ["1", "2", "3", "4", "5+"];
  if (item === "pickup") return pkg?.pickups ?? [];
  if (item === "room") return pkg?.adultRooms ?? [];
  return [];
}
