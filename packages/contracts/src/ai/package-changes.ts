// The AI change assistant: what an agency pasted, the exact changes proposed to one trip, and applying or undoing them.
// The model only proposes; code builds every value an apply writes from the cited lines (the proposal is stored server-side).
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { departureStatus } from "../departures/departures.js";
import { aiInputImageTypes, MAX_AI_IMAGE_BYTES, MAX_AI_RATE_SHEET_BYTES } from "../files/attachments.js";
import { MAX_SEATS } from "../departures/seat-limit.js";
import { roomPrices, roomPricesOutput } from "../quotes/room-prices.js";
import { packageFields, packageSeason, savePackageSeasonInput } from "../quotes/packages.js";
import { MAX_QUOTE_DAYS, quoteDay } from "../quotes/quotes.js";

const text = (max: number) => z.string().trim().max(max);

/** What the agency gave: its text, up to four photos or one PDF (uploaded as the rate reader's are), and its answers. */
export const proposePackageChangesInput = z.strictObject({
  packageId: recordId,
  text: text(8000),
  attachmentIds: z.array(recordId).max(4),
  answers: z
    .array(z.strictObject({ questionId: z.string().max(40), answer: text(200) }))
    .max(5)
    .default([]),
});
export type ProposePackageChangesInput = z.infer<typeof proposePackageChangesInput>;

/** A photo or a PDF for the assistant, uploaded as the rate reader's files are (an Excel file is the rate reader's alone). */
export const requestPackageChangesUploadInput = z.strictObject({
  contentType: z.enum([...aiInputImageTypes, "application/pdf"]),
  sizeBytes: z.int().min(1).max(Math.max(MAX_AI_RATE_SHEET_BYTES, MAX_AI_IMAGE_BYTES)),
});

/** Why a change starts unticked or carries a warning. */
export const packageChangeFlags = [
  "not_in_message",
  "other_trip",
  "cancelled_date",
  "has_bookings",
  "not_allowed",
  "past_date",
] as const;

/** The most changes one run proposes, and one Apply takes. */
export const MAX_PACKAGE_CHANGES = 60;

/**
 * Where a cited line is from: the pasted message (L1), a PDF's text (P1.L1), an answer to a question (A1), or a photo
 * (P2.L3: photo 2, line 3), whose words are the AI's reading of it, not code's.
 */
export const evidenceKinds = ["message", "pdf", "photo", "answer"] as const;
const evidence = z.array(z.object({ ref: z.string(), text: z.string(), kind: z.enum(evidenceKinds) }));
const base = { id: z.string(), evidence, flags: z.array(z.enum(packageChangeFlags)) };

const seasonLabel = savePackageSeasonInput.shape.label;
const seasonValue = { label: seasonLabel, prices: roomPrices };
const departureRef = { departureId: recordId, startDate: calendarDate };

/** The trip fields an agency can change by message, and the type of each one's value (the trip page's own rules). */
export const tripFields = [
  "seatsPerDeparture",
  "advancePerPersonPaise",
  "weeklyDays",
  "departureMonths",
  "pickupPoints",
  "startCity",
  "inclusions",
  "exclusions",
  "cancellationNotes",
] as const;
export type TripField = (typeof tripFields)[number];

const tripFieldValue = {
  seatsPerDeparture: packageFields.seatsPerDeparture,
  advancePerPersonPaise: packageFields.advancePerPersonPaise,
  weeklyDays: packageFields.weeklyDays,
  departureMonths: packageFields.departureMonths,
  pickupPoints: packageFields.pickupPoints,
  startCity: packageFields.startCity,
  inclusions: packageFields.inclusions,
  exclusions: packageFields.exclusions,
  cancellationNotes: packageFields.cancellationNotes,
} as const;
type TripFieldValues = { [Field in TripField]: z.infer<(typeof tripFieldValue)[Field]> };

const tripFieldChange = z
  .object({
    ...base,
    kind: z.literal("trip_field"),
    field: z.enum(tripFields),
    before: z.unknown(),
    value: z.unknown(),
  })
  .superRefine((change, context) => {
    const schema = tripFieldValue[change.field];
    for (const key of ["before", "value"] as const) {
      if (!schema.safeParse(change[key]).success) {
        context.addIssue({ code: "custom", path: [key], message: `Not a value for ${change.field}` });
      }
    }
  });

/** A trip field change with `before` and `value` typed by its field, so a screen can switch on `field`. */
export type TypedTripFieldChange = {
  [Field in TripField]: { field: Field; before: TripFieldValues[Field]; value: TripFieldValues[Field] };
}[TripField];

/** Narrows a parsed trip_field change's values by its field (the parse already checked them). */
export const tripFieldValueOf = (change: { field: TripField; before: unknown; value: unknown }): TypedTripFieldChange =>
  ({
    field: change.field,
    before: tripFieldValue[change.field].parse(change.before),
    value: tripFieldValue[change.field].parse(change.value),
  }) as TypedTripFieldChange;

export const packageChange = z.discriminatedUnion("kind", [
  // endsOn null: until changed.
  z.object({
    ...base,
    kind: z.literal("season_add"),
    ...seasonValue,
    startsOn: calendarDate,
    endsOn: calendarDate.nullable(),
  }),
  // A price column (seasonColumns' ids); covers the regular price and rooms not sold.
  z.object({
    ...base,
    kind: z.literal("season_change"),
    seasonIds: z.array(recordId).min(1),
    label: seasonLabel,
    before: z.object({ label: z.string(), prices: roomPrices }),
    prices: roomPrices,
  }),
  z.object({ ...base, kind: z.literal("departures_add"), dates: z.array(calendarDate).min(1).max(62) }),
  z.object({ ...base, kind: z.literal("departure_cancel"), ...departureRef, reason: text(200) }),
  z.object({ ...base, kind: z.literal("departure_reopen"), ...departureRef }),
  z.object({ ...base, kind: z.literal("departure_prices"), ...departureRef, before: roomPrices, prices: roomPrices }),
  z.object({
    ...base,
    kind: z.literal("departure_seats"),
    ...departureRef,
    before: z.int().min(0).max(MAX_SEATS).nullable(),
    seatsTotal: z.int().min(0).max(MAX_SEATS),
  }),
  tripFieldChange,
  z.object({ ...base, kind: z.literal("note_add"), line: text(500).min(1) }),
  z.object({ ...base, kind: z.literal("note_remove"), line: text(500).min(1) }),
  z.object({
    ...base,
    kind: z.literal("itinerary"),
    before: z.array(quoteDay).max(MAX_QUOTE_DAYS),
    days: z.array(quoteDay).max(MAX_QUOTE_DAYS),
  }),
  z.object({ ...base, kind: z.literal("ai_selling"), on: z.boolean() }),
]);
export type PackageChange = z.infer<typeof packageChange>;

export const packageChangeProposal = z.object({
  runId: recordId,
  changes: z.array(packageChange).max(MAX_PACKAGE_CHANGES),
  questions: z.array(z.object({ id: z.string(), text: z.string(), choices: z.array(z.string()) })),
  ignored: z.array(z.string()),
  notChanged: z.array(z.string()),
  brochureLeftOut: z.boolean(),
});
export type PackageChangeProposal = z.infer<typeof packageChangeProposal>;
/** The proposal as its run keeps it, with the day the trip's departures were read from (a later stamp reads the same days). */
export const storedPackageChangeProposal = packageChangeProposal.omit({ runId: true }).extend({ from: calendarDate });
export type StoredPackageChangeProposal = z.infer<typeof storedPackageChangeProposal>;

/** What an applied run replaced, as its row keeps it for Undo all: every season, the fields it changed, the AI switch,
 * the departures it (or the schedule it changed) touched, and the departures it made. */
export const packageChangeRunBefore = z.object({
  seasons: z.array(packageSeason),
  fields: z.object({ ...tripFieldValue, notes: packageFields.notes, days: packageFields.days }).partial(),
  selling: z.boolean().nullable(),
  departures: z.array(
    z.object({
      id: recordId,
      startDate: calendarDate,
      status: departureStatus,
      cancelledReason: z.string().nullable(),
      seatsTotal: z.int(),
      ownPrices: roomPricesOutput,
    }),
  ),
  createdDepartureIds: z.array(recordId),
});
export type PackageChangeRunBefore = z.infer<typeof packageChangeRunBefore>;

export const applyPackageChangesInput = z.strictObject({
  runId: recordId,
  changeIds: z.array(z.string()).min(1).max(MAX_PACKAGE_CHANGES),
});
export type ApplyPackageChangesInput = z.infer<typeof applyPackageChangesInput>;
export const applyPackageChangesOutput = z.object({ applied: z.number().int() });

export const undoPackageChangesInput = z.strictObject({ runId: recordId });
export type UndoPackageChangesInput = z.infer<typeof undoPackageChangesInput>;
/** Why Undo all left a departure as it is: it took a booking or a hold since, or its day (to open it again) has passed. */
export const undoKeptReasons = ["has_bookings", "has_holds", "past_date"] as const;
export const undoPackageChangesOutput = z.object({
  undone: z.number().int(),
  kept: z.array(z.object({ departureId: recordId, startDate: calendarDate, reason: z.enum(undoKeptReasons) })),
  /** The AI switch the run turned off could not be turned back on: the trip lacks something it needs to sell. */
  sellingNotRestored: z.boolean(),
});
export type UndoPackageChangesResult = z.infer<typeof undoPackageChangesOutput>;

export const latestPackageChangeRunInput = z.strictObject({ packageId: recordId });
export const latestPackageChangeRunOutput = z
  .object({ runId: recordId, appliedAt: z.date(), applied: z.number().int(), undoable: z.boolean() })
  .nullable();
export type LatestPackageChangeRun = z.infer<typeof latestPackageChangeRunOutput>;
