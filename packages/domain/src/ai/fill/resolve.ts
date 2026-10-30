// From the model's words to the form's values, by code (design 2): dates and times in the organization's zone, phone digits, a
// destination matched to the agency's list (else "new", for the person to confirm), a budget in paise, enums checked. A value
// that does not pass the form's own rules is dropped, and what the form needs and the source didn't give becomes a question.
import { budgetBases, foodPreferences, hotelCategories, tripTypes, callOutcomes } from "@travel-crm/contracts/crm";
import { toE164 } from "@travel-crm/contracts/kernel";
import { fillValueSchemas, type AiFillField, type FillPath, type FillTarget } from "@travel-crm/contracts/ai";
import type { CallAnswer, LeadAnswer, QuoteAnswer, TripAnswer } from "@travel-crm/contracts/ai";
import { contextOf, monthOfDay, resolveDay, resolveMonth, resolveTime } from "./dates.js";
import { paiseFromSpoken } from "./money.js";

export interface ResolveContext {
  /** The organization's today, yyyy-mm-dd. */
  today: string;
  from: AiFillField["from"];
  /** The agency's destination that this name is, else null. */
  matchDestination(name: string): Promise<{ id: string; name: string } | null>;
}

export interface Resolved {
  fields: AiFillField[];
  questions: string[];
}

type Excerpts = Record<string, unknown> | null | undefined;

/** Collects fields that pass the form's own rule for their path. */
class Collector {
  readonly fields: AiFillField[] = [];
  readonly questions: string[] = [];
  constructor(
    private readonly from: AiFillField["from"],
    private readonly excerpts: Excerpts,
  ) {}

  excerptOf(...keys: string[]): string {
    for (const key of keys) {
      const value = this.excerpts?.[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, 200);
    }
    return "";
  }

  add(path: FillPath, value: unknown, ...keys: string[]): boolean {
    const parsed = fillValueSchemas[path].safeParse(value);
    if (!parsed.success) return false;
    this.fields.push({
      path,
      value: parsed.data as AiFillField["value"],
      from: this.from,
      excerpt: this.excerptOf(...keys),
    });
    return true;
  }

  ask(question: string): void {
    if (!this.questions.includes(question)) this.questions.push(question);
  }
}

const oneOf = <Value extends string>(list: readonly Value[], word: string | null | undefined): Value | null => {
  const clean = (word ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  return list.find((value) => value === clean) ?? null;
};

/** "4 star", "4*", "four star" as the form's category. */
function hotelOf(word: string | null | undefined): (typeof hotelCategories)[number] | null {
  const text = (word ?? "").toLowerCase();
  const direct = oneOf(hotelCategories, text);
  if (direct !== null) return direct;
  const digit = /([345]|three|four|five)/.exec(text)?.[1];
  const star = { three: "3", four: "4", five: "5" }[digit ?? ""] ?? digit;
  return star === "3"
    ? "3_star"
    : star === "4"
      ? "4_star"
      : star === "5"
        ? "5_star"
        : /any|koi bhi/.test(text)
          ? "any"
          : null;
}

async function resolveTrip(answer: TripAnswer, context: ResolveContext, out: Collector): Promise<void> {
  const { today } = context;
  if (answer.destination !== undefined) {
    const match = await context.matchDestination(answer.destination);
    out.add(
      "trip.destination",
      match === null
        ? { kind: "new", name: answer.destination }
        : { kind: "existing", destinationId: match.id, name: match.name },
      "destination",
    );
  }
  const from = answer.dateFrom === undefined ? null : resolveDay(answer.dateFrom, today);
  const to =
    answer.dateTo === undefined ? null : resolveDay(answer.dateTo, today, from === null ? {} : contextOf(from));
  // "15 to 20 Dec": the 15 has no month of its own; it takes the 20's.
  const start =
    from ?? (answer.dateFrom !== undefined && to !== null ? resolveDay(answer.dateFrom, today, contextOf(to)) : null);
  const month = answer.month === undefined ? null : resolveMonth(answer.month, today);
  if (start !== null && to !== null && to >= start) {
    out.add("trip.when", { kind: "dates", from: start, to }, "dateFrom", "dateTo");
  } else if (start !== null) {
    // Only the start is known: the month is a fact, the end day is not.
    out.add("trip.when", { kind: "month", month: monthOfDay(start) }, "dateFrom");
    out.ask("What are the travel dates, start and end?");
  } else if (month !== null) {
    out.add("trip.when", { kind: "month", month }, "month");
  } else if (answer.flexible === true) {
    out.add("trip.when", { kind: "flexible" }, "flexible");
  } else if (answer.dateFrom !== undefined || answer.dateTo !== undefined || answer.month !== undefined) {
    out.ask("Which dates or which month are they travelling?");
  }
  if (answer.adults !== undefined) out.add("trip.adults", answer.adults, "adults");
  const ages = (answer.childrenAges ?? []).filter((age): age is number => typeof age === "number");
  if (ages.length > 0) out.add("trip.childrenAges", ages, "childrenAges", "childrenCount");
  else if ((answer.childrenCount ?? 0) > 0) out.ask("How old are the children?");
  if (answer.budget !== undefined && answer.budget !== null) {
    const paise = paiseFromSpoken(answer.budget);
    const basis = oneOf(budgetBases, answer.budgetBasis) ?? "per_person";
    if (paise === null) out.ask("What is the budget, in rupees?");
    else {
      out.add("trip.budget", { amount: { amountPaise: paise, currency: "INR" }, basis }, "budget");
      if (answer.budgetBasis === undefined) out.ask("Is the budget per person or for everyone?");
    }
  }
  const plain = [
    ["trip.departureCity", answer.departureCity, "departureCity"],
    ["trip.roomType", answer.roomType, "roomType"],
  ] as const;
  for (const [path, value, key] of plain) if (value !== undefined) out.add(path, value, key);
  const tripType = oneOf(tripTypes, answer.tripType);
  if (tripType !== null) out.add("trip.tripType", tripType, "tripType");
  const hotel = hotelOf(answer.hotelCategory);
  if (hotel !== null) out.add("trip.hotelCategory", hotel, "hotelCategory");
  const food = oneOf(foodPreferences, answer.food);
  if (food !== null) out.add("trip.food", food, "food");
}

/** A phone as the form stores it, or null (the person is asked for a valid one). */
const phoneOf = (text: string | null | undefined): string | null => (text ? toE164(text) : null);

export async function resolveLead(
  answer: TripAnswer & Partial<LeadAnswer>,
  target: Extract<FillTarget, "lead" | "lead_edit">,
  context: ResolveContext,
): Promise<Resolved> {
  const out = new Collector(context.from, answer.excerpts);
  if (target === "lead") {
    if (answer.name) out.add("person.name", answer.name, "name");
    const phone = phoneOf(answer.phone);
    if (phone !== null) out.add("person.phone", phone, "phone");
    else if (answer.phone) out.ask("The phone number didn't look right: what is it?");
    if (answer.email) out.add("person.email", answer.email, "email");
    if (answer.instagram) out.add("person.instagramHandle", answer.instagram, "instagram");
  }
  await resolveTrip(answer, context, out);
  if (target === "lead") {
    // A second number is not the lead's: it goes into the note, where a person sees it.
    const second = phoneOf(answer.phone2);
    const note = [answer.note, second === null ? null : `Second number: ${second}`].filter(Boolean).join("\n");
    if (note !== "") out.add("note", note, "note", "phone2");
  }
  return { fields: out.fields, questions: out.questions.concat(answer.questions ?? []).slice(0, 5) };
}

export async function resolveCall(answer: CallAnswer, context: ResolveContext): Promise<Resolved> {
  const out = new Collector(context.from, answer.excerpts);
  const outcome = oneOf(callOutcomes, answer.outcome);
  if (outcome !== null) out.add("call.outcome", outcome, "outcome");
  if (answer.note) out.add("call.note", answer.note, "note");
  if (answer.followUpDay !== undefined || answer.followUpTime !== undefined) {
    const day = answer.followUpDay === undefined ? null : resolveDay(answer.followUpDay, context.today);
    const time = answer.followUpTime === undefined ? null : resolveTime(answer.followUpTime);
    if (day === null) out.ask("Which day is the follow-up?");
    else if (time === null) out.ask("At what time is the follow-up?");
    else {
      const title = answer.followUpTitle;
      out.add(
        "call.followUp",
        { due: { on: day, at: time }, ...(title ? { title } : {}) },
        "followUpDay",
        "followUpTime",
      );
    }
  }
  await resolveTrip(answer, context, out);
  return { fields: out.fields, questions: out.questions.concat(answer.questions ?? []).slice(0, 5) };
}

export function resolveQuote(answer: QuoteAnswer, context: ResolveContext): Resolved {
  const out = new Collector(context.from, answer.excerpts);
  if (answer.title) out.add("quote.title", answer.title, "title");
  if (answer.startDate !== undefined) {
    const day = resolveDay(answer.startDate, context.today);
    if (day === null) out.ask("Which day does the trip start?");
    else out.add("quote.startDate", day, "startDate");
  }
  if (answer.adults !== undefined) out.add("quote.adults", answer.adults, "adults");
  if (answer.children !== undefined) out.add("quote.children", answer.children, "children");
  const days = (answer.days ?? []).flatMap((day) =>
    day.title ? [{ title: day.title, description: day.description ?? "" }] : [],
  );
  if (days.length > 0) out.add("quote.days", days, "days");
  // Lines come without a price: the person types it. A quantity the source didn't give is one.
  const items = (answer.items ?? []).flatMap((item) =>
    item.description
      ? [{ description: item.description, detail: item.detail ?? "", quantity: Math.max(1, item.quantity ?? 1) }]
      : [],
  );
  if (items.length > 0) out.add("quote.items", items, "items");
  for (const [path, value, key] of [
    ["quote.inclusions", answer.inclusions, "inclusions"],
    ["quote.exclusions", answer.exclusions, "exclusions"],
    ["quote.notes", answer.notes, "notes"],
  ] as const) {
    if (value) out.add(path, value, key);
  }
  return { fields: out.fields, questions: out.questions.concat(answer.questions ?? []).slice(0, 5) };
}
