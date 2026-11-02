// "Draft the days" (release ai3): what code knows about a quote's trip (the lead, the quote's own lines without prices, the
// agency's packages for the place, the agency's knowledge) gathered into facts for the model, and the model's answer made into the
// quote's days. Code keeps exactly the number of days the trip has, trims to the quote's limits and takes out any amount the
// model typed. The model writes the words; it prices nothing, and a hotel or a vehicle is named only if the quote or the
// agency's own pieces name it.
import { MAX_QUOTE_DAYS, type QuoteDetail } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { getLead } from "../../crm/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { knowledgeWords } from "../knowledge.js";
import { withoutTypedAmounts } from "../write-up/tokens.js";
import type { DraftFacts } from "./draft-days-prompt.js";

/** A longer trip is split into two quotes: a single draft this long would be shallow. */
export const DRAFT_DAYS_MAX = 21;
const PACKAGES_MAX = 3;
const PACKAGE_TEXT_MAX = 600;
const dayMs = 86_400_000;

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs) + 1;

/** "5 days", "5 din", "4 nights" in the staff member's note: nights are one fewer than days. */
export function daysInNote(note: string): number | null {
  const days = /(\d{1,2})\s*(?:days?|din)\b/i.exec(note)?.[1];
  if (days !== undefined) return Number(days);
  const nights = /(\d{1,2})\s*(?:nights?|raat)\b/i.exec(note)?.[1];
  return nights === undefined ? null : Number(nights) + 1;
}

const monthWords = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

interface PackageRow {
  name: string;
  nights: number | null;
  days: unknown;
}

const trimmed = (text: string) => (text.length <= PACKAGE_TEXT_MAX ? text : `${text.slice(0, PACKAGE_TEXT_MAX - 1)}…`);

function packageDays(row: PackageRow): { title: string; description: string }[] {
  if (!Array.isArray(row.days)) return [];
  return (row.days as { title?: unknown; description?: unknown }[]).flatMap((day) =>
    typeof day.title === "string"
      ? [
          {
            title: trimmed(day.title),
            description: trimmed(typeof day.description === "string" ? day.description : ""),
          },
        ]
      : [],
  );
}

interface Plan {
  name: string;
  nights: number | null;
  days: { title: string; description: string }[];
}

/** The agency's packages for the place that hold a plan. */
async function plansFor(tx: OrgTx, destinationId: string | null): Promise<Plan[]> {
  if (destinationId === null) return [];
  const rows: PackageRow[] = await tx.quoteTemplate.findMany({
    where: { destinationId },
    select: { name: true, nights: true, days: true },
  });
  return rows
    .map((row) => ({ name: row.name, nights: row.nights, days: packageDays(row) }))
    .filter((row) => row.days.length > 0);
}

/** Up to three of them, the one whose nights are nearest the trip's first. */
function nearest(plans: readonly Plan[], wantedNights: number | null): Plan[] {
  const distance = (plan: Plan) =>
    plan.nights === null || wantedNights === null ? Number.MAX_SAFE_INTEGER : Math.abs(plan.nights - wantedNights);
  return [...plans].sort((a, b) => distance(a) - distance(b) || a.name.localeCompare(b.name)).slice(0, PACKAGES_MAX);
}

export interface DraftPrepared {
  facts: DraftFacts;
  /** The days the draft must have, exactly. */
  dayCount: number;
  /** Names of the packages used, for the sheet's "from package X" line. */
  packageNames: string[];
  /** The package days the model may name as a day's source. */
  labels: string[];
}

/**
 * Gathers what the model is allowed to know. Refused (before a call is taken) when the trip's length is unknown or too long.
 * The member's scope decides which lead and quote exist for them.
 */
export async function gatherDraftFacts(
  tx: OrgTx,
  access: MemberAccess,
  quote: QuoteDetail,
  note: string,
): Promise<DraftPrepared> {
  const lead = await getLead(tx, access, quote.leadId);
  const trip = lead.trip;
  const plans = await plansFor(tx, trip.destination?.id ?? null);
  const fromDates = trip.when.kind === "dates" ? daysBetween(trip.when.from, trip.when.to) : null;
  const firstPlan = nearest(plans, null)[0];
  // The trip's dates first, then what the note says, the package's nights, and the days already on the quote.
  const dayCount =
    fromDates ??
    daysInNote(note) ??
    (quote.startDate !== null && firstPlan !== undefined && firstPlan.nights !== null ? firstPlan.nights + 1 : null) ??
    (quote.days.length > 0 ? quote.days.length : null);
  if (dayCount === null || dayCount < 1) {
    throw new DomainError(
      "VALIDATION",
      "DRAFT_DAYS_UNKNOWN",
      "How many days is the trip? Set the lead's dates or say it",
    );
  }
  if (dayCount > DRAFT_DAYS_MAX) {
    throw new DomainError("VALIDATION", "DRAFT_TOO_LONG", "A trip this long is better drafted in two parts");
  }
  // Now that the length is known, the plans whose nights fit it best.
  const chosen = nearest(plans, dayCount - 1);
  const knowledge = await knowledgeWords(tx);
  const settings = await tx.aiSettings.findFirstOrThrow({ select: { instructions: true, writeStyle: true } });
  const start = trip.when.kind === "dates" ? trip.when.from : quote.startDate;
  const month =
    trip.when.kind === "month"
      ? monthWords.format(new Date(`${trip.when.month}-01T00:00:00Z`))
      : start === null
        ? null
        : monthWords.format(new Date(`${start}T00:00:00Z`));
  return {
    dayCount,
    packageNames: chosen.map((one) => one.name),
    labels: packageDayLabels(chosen),
    facts: {
      destination: trip.destination?.name ?? null,
      dayCount,
      month,
      adults: quote.adults > 0 ? quote.adults : (trip.adults ?? null),
      childrenAges: trip.childrenAges,
      tripType: trip.tripType,
      hotelCategory: trip.hotelCategory,
      food: trip.food,
      roomType: trip.roomType,
      departureCity: trip.departureCity,
      // Only a tone: the amount never reaches the prompt.
      budgetConscious: trip.budget !== null,
      items: quote.items.map((item) => `${item.description}${item.detail === "" ? "" : ` (${item.detail})`}`),
      packages: chosen,
      knowledge,
      instructions: settings.instructions,
      writeStyle: settings.writeStyle,
      note,
    },
  };
}

/** The labels a day may say it came from: "Manali 5N, day 3", one for each day of each plan given to the model. */
export const packageDayLabels = (plans: readonly { name: string; days: readonly unknown[] }[]): string[] =>
  plans.flatMap((plan) => plan.days.map((_, index) => `${plan.name}, day ${String(index + 1)}`));

export interface DraftResolved {
  days: { title: string; description: string }[];
  /** For each day, the package day it was taken from, or "". */
  hints: string[];
  questions: string[];
  /** An amount the model typed was taken out. */
  removedAmounts: boolean;
}

/** The model's days as exactly `dayCount` days within the quote's limits; a missing day is a question, an extra is dropped. */
export function resolveDraftDays(
  answer: {
    days?: { title?: string | undefined; description?: string | undefined; from?: string | undefined }[] | undefined;
  },
  dayCount: number,
  questions: readonly string[],
  labels: readonly string[] = [],
): DraftResolved {
  let removedAmounts = false;
  const clean = (text: string) => {
    const result = withoutTypedAmounts(text);
    removedAmounts ||= result.removed;
    return result.text.trim();
  };
  const kept = (answer.days ?? [])
    .flatMap((day) => {
      const title = clean(day.title ?? "").slice(0, 120);
      // Only a label code gave the model counts: a made-up source is dropped.
      const from = labels.find((label) => label.toLowerCase() === (day.from ?? "").trim().toLowerCase()) ?? "";
      return title === "" ? [] : [{ day: { title, description: clean(day.description ?? "").slice(0, 2000) }, from }];
    })
    .slice(0, Math.min(dayCount, MAX_QUOTE_DAYS));
  const days = kept.map((one) => one.day);
  const hints = kept.map((one) => one.from);
  const asked = [...questions];
  if (days.length < dayCount) {
    asked.push(`The AI wrote ${String(days.length)} of the ${String(dayCount)} days: add the rest yourself`);
  }
  return { days, hints, questions: asked.slice(0, 5), removedAmounts };
}
