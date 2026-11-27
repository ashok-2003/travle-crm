// One lead as a row of the lead export (B38, B39): the cells in B38's order, in the words the screens use (D29), dates
// and times on the agency's clock (D28), and the budget in rupees as a number.
import { leadExportHeaders, wordOf, type FileWordField } from "@travel-crm/contracts/crm";
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import type { TripColumns } from "../trip-columns.js";

/** The columns' kinds, in B38's order, one for each of the contract's headers. */
const kinds: Record<(typeof leadExportHeaders)[number], WriterColumn["kind"]> = {
  Name: "text",
  Phone: "phone",
  Email: "text",
  Instagram: "text",
  Returning: "text",
  Stage: "text",
  Destination: "text",
  "Travel from": "date",
  "Travel to": "date",
  "Travel month": "text",
  Adults: "number",
  "Children's ages": "text",
  Budget: "number",
  "Budget basis": "text",
  "Departure city": "text",
  "Trip type": "text",
  "Hotel category": "text",
  Food: "text",
  "Room type": "text",
  Owner: "text",
  Source: "text",
  "Source detail": "text",
  "Added on": "date-time",
  "Next follow-up": "date-time",
  "Next follow-up note": "text",
  "Lead link": "text",
};

export const leadExportColumns: readonly WriterColumn[] = leadExportHeaders.map((header) => ({
  header,
  kind: kinds[header],
}));

/** A row of leadListQuery joined to a row of leadExportRowsQuery. */
export interface ExportedLead
  extends
    Pick<
      TripColumns,
      | "destinationId"
      | "travelKind"
      | "travelStart"
      | "travelEnd"
      | "travelMonth"
      | "adults"
      | "budgetPaise"
      | "budgetBasis"
    >,
    Pick<TripColumns, "childrenAges" | "departureCity" | "tripType" | "hotelCategory" | "food" | "roomType"> {
  id: string;
  stage: string;
  returning: boolean;
  ownerUserId: string | null;
  source: string;
  createdAt: Date;
  personName: string;
  personPhone: string | null;
  email: string | null;
  instagramHandle: string | null;
  sourceDetail: string | null;
}

/** What a page of rows is written with: names and the next follow-up, which the rows themselves don't hold. */
export interface ExportContext {
  timeZone: string;
  appUrl: string;
  destinationNames: ReadonlyMap<string, string>;
  /** Owners' names by user id; one missing is a member who has left. */
  ownerNames: ReadonlyMap<string, string>;
  nextTask: { title: string; dueAt: string } | undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const dayOf = (date: Date | null) => (date === null ? null : date.toISOString().slice(0, 10));

/** "Dec 2026" for a month, "Flexible" for a flexible trip, otherwise nothing. */
function travelMonthOf(lead: Pick<ExportedLead, "travelKind" | "travelMonth">): string | null {
  if (lead.travelKind === "flexible") return "Flexible";
  if (lead.travelKind !== "month" || lead.travelMonth === null) return null;
  return `${MONTHS[lead.travelMonth.getUTCMonth()] ?? ""} ${String(lead.travelMonth.getUTCFullYear())}`;
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/**
 * An instant as the agency's wall clock reads: "2026-10-19T23:50". One cached formatter and one string per call: the
 * kernel's calendarDateIn and timeOfDayIn take apart every instant they format, which for 100,000 cells (two to a
 * lead) costs seconds and hundreds of MB of the worker's memory.
 */
export function wallClockOf(instant: Date, timeZone: string): string {
  let clock = clocks.get(timeZone);
  if (clock === undefined) {
    // Sweden's order is year-month-day, hours 00-23: "2026-10-19 23:50".
    clock = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clocks.set(timeZone, clock);
  }
  return clock.format(instant).replace(/\s+/, "T");
}

/**
 * Paise as rupees, whole rupees plus the paise's hundredths, from the bigint: the cell is a number (B38) so a sheet can
 * add and sort it, which a text cell would stop.
 */
const rupees = (paise: bigint) => Number(paise / 100n) + Number(paise % 100n) / 100;

const wordOrNull = (field: FileWordField, key: string | null) => (key === null ? null : wordOf(field, key));

/** An owner who is no longer an active member (removed or banned) shows as "Former member" (B38). */
export function exportRowOf(lead: ExportedLead, context: ExportContext): WrittenCell[] {
  const { timeZone, nextTask } = context;
  const owner = lead.ownerUserId === null ? null : (context.ownerNames.get(lead.ownerUserId) ?? "Former member");
  return [
    lead.personName,
    lead.personPhone === null ? null : internationalPhone(lead.personPhone),
    lead.email,
    lead.instagramHandle,
    lead.returning ? "Yes" : null,
    wordOf("stage", lead.stage),
    lead.destinationId === null ? null : (context.destinationNames.get(lead.destinationId) ?? null),
    dayOf(lead.travelStart),
    dayOf(lead.travelEnd),
    travelMonthOf(lead),
    lead.adults,
    lead.childrenAges.length === 0 ? null : lead.childrenAges.join(", "),
    lead.budgetPaise === null ? null : rupees(lead.budgetPaise),
    wordOrNull("budgetBasis", lead.budgetBasis),
    lead.departureCity,
    wordOrNull("tripType", lead.tripType),
    wordOrNull("hotelCategory", lead.hotelCategory),
    wordOrNull("food", lead.food),
    lead.roomType,
    owner,
    wordOf("source", lead.source),
    lead.sourceDetail,
    wallClockOf(lead.createdAt, timeZone),
    nextTask === undefined ? null : wallClockOf(new Date(nextTask.dueAt), timeZone),
    nextTask?.title ?? null,
    `${context.appUrl}/leads/${lead.id}`,
  ];
}
