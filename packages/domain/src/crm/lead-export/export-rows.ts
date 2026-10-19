// One lead as a row of the lead export (B38, B39): the cells in B38's order, in the words the screens use (D29), dates
// and times on the agency's clock (D28), and the budget in rupees as a number.
import { leadExportHeaders, wordOf, type FileWordField } from "@travel-crm/contracts/crm";
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { WriterColumn, WrittenCell } from "@travel-crm/integrations/spreadsheets";
import { calendarDateIn, timeOfDayIn } from "../../kernel/index.js";
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

/** An instant as the agency's wall clock reads: "2026-10-19T23:50". */
export const wallClockOf = (instant: Date, timeZone: string) =>
  `${calendarDateIn(instant, timeZone)}T${timeOfDayIn(instant, timeZone)}`;

const wordOrNull = (field: FileWordField, key: string | null) => (key === null ? null : wordOf(field, key));

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
    lead.budgetPaise === null ? null : Number(lead.budgetPaise) / 100,
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
