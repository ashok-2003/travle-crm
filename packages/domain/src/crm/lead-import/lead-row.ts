// Reading one row of a lead file into an enquiry (spec B14-B24, D16, D17): the person and their contacts, the trip,
// the stage and owner, the source, the enquiry date and the note, or the reasons the row can't be added. What a cell
// holds that can't be read stays in the lead's note (B21). A pure function: the check and the add read a row the same.
import {
  emailAddress,
  instagramHandle,
  personName,
  type BudgetBasis,
  type ContactKind,
  type LeadImportField,
  type LeadImportStage,
  type LeadSource,
  type LeadStage,
} from "@travel-crm/contracts/crm";
import type { RowReason } from "@travel-crm/contracts/imports";
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import { toE164 } from "@travel-crm/contracts/kernel";
import type { SheetRow } from "@travel-crm/integrations/spreadsheets";
import type { ColumnMatches } from "../../imports/index.js";
import { instantAt, parseTimeOfDay, startOfDayIn, type CalendarDate } from "../../kernel/index.js";
import type { Enquiry } from "../save-enquiry.js";
import { readDayAndTime } from "./row-values.js";
import { readTrip, type RowCell } from "./trip-values.js";

export interface LeadRowContext {
  columns: ColumnMatches;
  /** The file's header cells, by position: a Note column's lines are labelled with its own header. */
  headers: readonly string[];
  /** The value match's target (a lead worker's user id); null: the default owner. */
  ownerOf(value: string): string | null;
  /** The value match's target; null: the default stage. */
  stageOf(value: string): LeadStage | null;
  defaults: { stage: LeadImportStage; ownerUserId: string; budgetBasis: BudgetBasis };
  fileName: string;
  /** Today on the agency's clock: an enquiry date after it can't be believed (B23). */
  today: CalendarDate;
  /** The agency's time zone: a date alone is the start of that day in it. */
  timeZone: string;
  /** Set when a Google Sheet's rows are being read (the Sheets sync): its source, time zone and date locale. */
  origin?: SheetOrigin;
}

/** A row's contacts as stored: E.164, a lower-case email, a handle without "@"; null when it has none we can use. */
export interface LeadRowContacts {
  phone: string | null;
  email: string | null;
  instagramHandle: string | null;
}

export type LeadRowReading =
  | {
      kind: "enquiry";
      enquiry: Enquiry;
      stage: LeadStage;
      ownerUserId: string;
      createdAt: Date | null;
      /** Whether a value we couldn't read was kept in the note (B21). */
      noted: boolean;
      contacts: LeadRowContacts;
      destinationName: string | null;
      /** The row's matched values as read, for its fingerprint (B33): the same for a file and a sheet. */
      fingerprintValues: readonly (string | null)[];
      exampleName: string;
    }
  | { kind: "not_added"; reasons: RowReason[]; exampleName: string | null; exampleValue: string | null };

const MAX_NOTE = 4000;
const MAX_SOURCE_DETAIL = 120;
/** What people type for "nothing here". */
const EMPTY_WORDS = new Set(["-", "--", "n/a", "na", "nil", "null", "none"]);

function cellText(row: SheetRow, position: number): string | null {
  // A NUL can't be stored in text: it would fail the check's and the add's writes, so it is dropped as it is read.
  const text = row.cells[position]?.replaceAll("\u0000", "").trim() ?? "";
  return text === "" || EMPTY_WORDS.has(text.toLowerCase()) ? null : text;
}

function instagramOf(text: string): string | null {
  const handle = text.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
  const parsed = instagramHandle.safeParse(handle);
  return parsed.success ? parsed.data : null;
}

interface ReadContacts {
  contacts: LeadRowContacts;
  /** Contacts that were given but aren't one, for the note when the row has another, else the example. */
  unusable: { kind: ContactKind; text: string }[];
}

function readContacts(cell: RowCell): ReadContacts {
  const unusable: ReadContacts["unusable"] = [];
  const phoneText = cell("phone");
  const emailText = cell("email");
  const handleText = cell("instagram");
  const phone = phoneText === null ? null : toE164(phoneText);
  const email = emailText === null ? null : (emailAddress.safeParse(emailText).data ?? null);
  const handle = handleText === null ? null : instagramOf(handleText);
  if (phoneText !== null && phone === null) unusable.push({ kind: "phone", text: phoneText });
  if (emailText !== null && email === null) unusable.push({ kind: "email", text: emailText });
  if (handleText !== null && handle === null) unusable.push({ kind: "instagram", text: handleText });
  return { contacts: { phone, email, instagramHandle: handle }, unusable };
}

const contactLabels: Record<ContactKind, string> = { phone: "Phone", email: "Email", instagram: "Instagram" };

/** The enquiry date: its start of day on the agency's clock, or, with a time and a sheet's zone, that moment. */
function readEnquiryDate(
  text: string,
  context: LeadRowContext,
): { day: CalendarDate | null; createdAt: Date | null; unusable: boolean } {
  const read = readDayAndTime(text, { monthFirstDates: context.origin?.monthFirstDates ?? false });
  if (read === null) return { day: null, createdAt: null, unusable: true };
  if (read.day > context.today) return { day: read.day, createdAt: null, unusable: true };
  if (read.time === null || context.origin === undefined) {
    return { day: read.day, createdAt: startOfDayIn(read.day, context.timeZone), unusable: false };
  }
  const { hour, minute, second } = read.time;
  const at = instantAt(
    read.day,
    parseTimeOfDay(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`),
    context.origin.timeZone,
  );
  return { day: read.day, createdAt: new Date(at.getTime() + second * 1000), unusable: false };
}

function sourceOf(context: LeadRowContext, theirSource: string | null): { source: LeadSource; detail: string } {
  const base = context.origin?.detail ?? context.fileName;
  const detail = theirSource === null ? base : `${base} · ${theirSource}`;
  return {
    source: context.origin === undefined ? "bulk_upload" : "google_sheet",
    detail: detail.slice(0, MAX_SOURCE_DETAIL),
  };
}

export function readLeadRow(row: SheetRow, context: LeadRowContext): LeadRowReading {
  const cellsOf = (field: LeadImportField) =>
    context.columns.positionsOf(field).flatMap((position) => cellText(row, position) ?? []);
  const cell: RowCell = (field) => cellsOf(field)[0] ?? null;

  const name = personName.safeParse(cell("name") ?? "").data ?? null;
  const { contacts, unusable } = readContacts(cell);
  const hasContact = contacts.phone !== null || contacts.email !== null || contacts.instagramHandle !== null;
  const stageText = cell("stage");
  const stage = (stageText === null ? null : context.stageOf(stageText)) ?? context.defaults.stage;

  const reasons: RowReason[] = [];
  if (name === null) reasons.push({ code: "no_name" });
  if (!hasContact) reasons.push({ code: "no_contact" });
  if (stage === "not_a_lead") reasons.push({ code: "not_a_lead" });

  const kept: string[] = unusable.map((contact) => `${contactLabels[contact.kind]}: ${contact.text}`);
  const dayOptions = { monthFirstDates: context.origin?.monthFirstDates ?? false };
  const trip = readTrip(cell, { defaultBasis: context.defaults.budgetBasis, dayOptions });
  kept.push(...trip.kept);
  const enquiryText = cell("enquiry_date");
  const enquiryDate = enquiryText === null ? null : readEnquiryDate(enquiryText, context);
  if (enquiryText !== null && enquiryDate?.unusable === true) kept.push(`Enquiry date: ${enquiryText}`);

  const noteLines = context.columns.positionsOf("note").flatMap((position) => {
    const text = cellText(row, position);
    return text === null ? [] : [`${context.headers[position] ?? "Note"}: ${text}`];
  });
  const note = [...noteLines, ...kept].join("\n");
  if (note.length > MAX_NOTE) reasons.push({ code: "notes_too_long" });

  if (reasons.length > 0 || name === null) {
    const rejected = unusable[0]?.text ?? stageText;
    return { kind: "not_added", reasons, exampleName: name, exampleValue: rejected };
  }
  const { source, detail } = sourceOf(context, cell("their_source"));
  const ownerText = cell("owner");
  const ownerUserId = (ownerText === null ? null : context.ownerOf(ownerText)) ?? context.defaults.ownerUserId;
  return {
    kind: "enquiry",
    enquiry: {
      person: {
        name,
        ...(contacts.phone === null ? {} : { phone: contacts.phone }),
        ...(contacts.email === null ? {} : { email: contacts.email }),
        ...(contacts.instagramHandle === null ? {} : { instagramHandle: contacts.instagramHandle }),
      },
      trip: trip.trip,
      note: note === "" ? null : note,
      source,
      sourceDetail: detail,
    },
    stage,
    ownerUserId,
    createdAt: enquiryDate?.createdAt ?? null,
    noted: kept.length > 0,
    contacts,
    destinationName: trip.destinationName,
    fingerprintValues: fingerprintValuesOf(name, contacts, trip.trip, trip.destinationName, {
      stageText,
      ownerText,
      enquiryDay: enquiryDate?.day ?? null,
      theirSource: cell("their_source"),
      note,
    }),
    exampleName: name,
  };
}

function fingerprintValuesOf(
  name: string,
  contacts: LeadRowContacts,
  trip: ReturnType<typeof readTrip>["trip"],
  destination: string | null,
  rest: {
    stageText: string | null;
    ownerText: string | null;
    enquiryDay: CalendarDate | null;
    theirSource: string | null;
    note: string;
  },
): (string | null)[] {
  const { when, budget } = trip;
  return [
    name,
    contacts.phone,
    contacts.email,
    contacts.instagramHandle,
    destination,
    when.kind,
    when.kind === "dates" ? when.from : null,
    when.kind === "dates" ? when.to : null,
    when.kind === "month" ? when.month : null,
    trip.adults === null ? null : String(trip.adults),
    trip.childrenAges.join(","),
    budget === null ? null : String(budget.amount.amountPaise),
    budget?.basis ?? null,
    trip.departureCity,
    trip.tripType,
    trip.hotelCategory,
    trip.food,
    trip.roomType,
    rest.stageText,
    rest.ownerText,
    rest.enquiryDay,
    rest.theirSource,
    rest.note === "" ? null : rest.note,
  ];
}
