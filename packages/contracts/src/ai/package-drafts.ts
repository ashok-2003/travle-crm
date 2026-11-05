// AI plan 2: a group package drafted from an agency's own documents. The AI proposes values with the lines they came from;
// nothing here saves a package. Only the owner's "Save as package" does, through createGroupPackageInput.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { MAX_SEATS } from "../departures/seat-limit.js";
import { roomPrices, roomType, roomTypes } from "../quotes/room-prices.js";
import { MAX_QUOTE_DAYS, MAX_QUOTE_PAISE, quoteDay } from "../quotes/quotes.js";
import { MAX_HIGHLIGHTS } from "../quotes/packages.js";

/** One call's source budget (characters), the trips one read may list and the days one draft may hold. */
export const PACKAGE_DRAFT_CHARACTERS = 40_000;
export const MAX_FOUND_TRIPS = 20;
export const MAX_DRAFT_DAYS = 15;

const text = (max: number) => z.string().trim().max(max);
const paise = z.int().min(0).max(MAX_QUOTE_PAISE);
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

/** A line of the agency's documents a value came from: its token, the piece's title and the words. */
export const sourceRef = z.object({ token: z.string(), source: z.string(), excerpt: z.string() });
export type SourceRef = z.infer<typeof sourceRef>;

/** A proposed value with its evidence; null when the documents do not say, `checkThis` when a figure was not printed in its line. */
export const evidenced = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), evidence: z.array(sourceRef), checkThis: z.boolean() });

export const foundTrip = z.object({
  ref: z.string(),
  name: z.string(),
  placeWords: z.string(),
  destinationId: recordId.nullable(),
  destinationName: z.string().nullable(),
  nights: z.int().nullable(),
  evidence: z.array(sourceRef),
});
export type FoundTrip = z.infer<typeof foundTrip>;

export const foundTrips = z.object({
  /** Null while only the parts are offered: no call has been made. */
  fillId: recordId.nullable(),
  trips: z.array(foundTrip).max(MAX_FOUND_TRIPS),
  /** Parts of sources longer than one call; nothing is sent until one is chosen. */
  parts: z.array(z.object({ ref: z.string(), label: z.string() })),
  readPart: z.string().nullable(),
});
export type FoundTrips = z.infer<typeof foundTrips>;

/** What the model answers to "find the trips": checked before anything is trusted; a bad field is emptied, a bad shape refused. */
export const foundTripsAnswer = z.object({
  trips: z.array(
    z.object({
      name: z.string().trim().min(1).max(120),
      place: z.string().trim().max(80).catch(""),
      nights: z.int().min(0).max(60).nullable().catch(null),
      lines: z.array(z.string()).max(200).catch([]),
    }),
  ),
});

export const findTripsInput = z.strictObject({ part: z.string().optional() });
export type FindTripsInput = z.infer<typeof findTripsInput>;

/** The trip to draft, as the screen got it from "find trips": the fill it came from, and the trip's name and line tokens. */
export const draftPackageInput = z.strictObject({
  fillId: recordId,
  trip: z.strictObject({
    ref: z.string().max(40),
    name: z.string().min(1).max(120),
    tokens: z.array(z.string().max(20)).min(1).max(200),
  }),
});
export type DraftPackageInput = z.infer<typeof draftPackageInput>;

const cited = z.array(z.string().max(20)).max(50).catch([]);
/** A field the model answers: a value and the tokens of the lines that say it; a bad one is emptied, never fatal. */
const answered = <T extends z.ZodType>(value: T) =>
  z
    .object({ value: z.union([value, z.null()]).catch(null), tokens: cited })
    .catch(() => ({ value: null, tokens: [] }) as never);
/** A list of candidates: an item that is not valid is dropped to null, so every valid one still arrives. */
const candidates = <T extends z.ZodType>(item: T) =>
  z
    .array(z.union([item, z.null()]).catch(null))
    .max(60)
    .catch([]);
const printedPrice = z.object({ room: z.string().max(20), printed: z.string().max(40), tokens: cited });

/** What the model answers to "draft this trip": checked before anything is trusted. Prices are printed text; code converts them. */
export const packageDraftAnswer = z.object({
  name: answered(z.string().max(200)),
  title: answered(z.string().max(300)),
  destination: answered(z.string().max(200)),
  nights: answered(z.int().min(0).max(60)),
  roomTypes: answered(z.array(z.string().max(20)).max(12)),
  /** Weekday names; one item per schedule the lines give. */
  weeklyDays: candidates(z.object({ value: z.array(z.string().max(20)).max(14), tokens: cited })),
  departureMonths: answered(z.array(z.int().min(1).max(12)).max(12)),
  seasons: candidates(
    z.object({
      label: z.string().max(80).catch(""),
      fromMonth: z.int().min(1).max(12),
      toMonth: z.int().min(1).max(12),
      tokens: cited,
      prices: candidates(printedPrice),
    }),
  ),
  pricesIncludeGst: answered(z.boolean()),
  advancePerPerson: candidates(z.object({ printed: z.string().max(40), tokens: cited })),
  pickupPoints: answered(z.string().max(3000)),
  startCity: answered(z.string().max(200)),
  inclusions: answered(z.string().max(6000)),
  exclusions: answered(z.string().max(6000)),
  cancellationNotes: answered(z.string().max(4000)),
  summary: answered(z.string().max(2000)),
  highlights: answered(z.array(z.string().max(300)).max(30)),
  days: candidates(z.object({ title: z.string().max(300), description: z.string().max(4000), tokens: cited })),
});

/** A room type's array has one item when the sources agree and more when they disagree; the owner picks one. */
const priceAlternatives = z.array(evidenced(paise));
export const draftSeason = z.object({
  label: evidenced(z.string()),
  startsOn: calendarDate,
  endsOn: calendarDate,
  prices: z.object({
    single: priceAlternatives,
    double: priceAlternatives,
    triple: priceAlternatives,
    quad: priceAlternatives,
    child_bed: priceAlternatives,
    child_no_bed: priceAlternatives,
  }),
});
export type DraftSeason = z.infer<typeof draftSeason>;

export const packageDraft = z.object({
  fillId: recordId,
  tripRef: z.string(),
  name: evidenced(z.string()),
  title: evidenced(z.string()),
  destination: evidenced(z.string()),
  destinationId: recordId.nullable(),
  nights: evidenced(z.int()),
  roomTypes: evidenced(z.array(roomType)),
  /** One item per schedule the sources give; more than one means they disagree. */
  weeklyDays: z.array(evidenced(z.array(z.int()))),
  departureMonths: evidenced(z.array(z.int())),
  seasons: z.array(draftSeason),
  pricesIncludeGst: evidenced(z.boolean()),
  advancePerPersonPaise: z.array(evidenced(paise)),
  pickupPoints: evidenced(z.string()),
  startCity: evidenced(z.string()),
  inclusions: evidenced(z.string()),
  exclusions: evidenced(z.string()),
  cancellationNotes: evidenced(z.string()),
  summary: evidenced(z.string()),
  highlights: evidenced(z.array(z.string())),
  days: z.array(evidenced(quoteDay)).max(MAX_DRAFT_DAYS),
  brochureKnowledgeId: recordId.nullable(),
});
export type PackageDraft = z.infer<typeof packageDraft>;

const seasonToSave = z
  .strictObject({ label: text(60).min(1), startsOn: calendarDate, endsOn: calendarDate, prices: roomPrices })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The season must end on or after its first day",
    path: ["endsOn"],
  });

/** "Save as package": what the owner chose from a draft. The same bounds as packageFields and savePackageSeasonInput. */
export const createGroupPackageInput = z.strictObject({
  fillId: recordId,
  name: text(80).min(1),
  title: text(120).min(1),
  destinationName: text(80).min(1),
  nights: z.int().min(0).max(60).nullable(),
  roomTypes: z.array(roomType).max(roomTypes.length).refine(unique, "Each room type once"),
  weeklyDays: z.array(z.int().min(0).max(6)).max(7).refine(unique, "Each day once"),
  departureMonths: z.array(z.int().min(1).max(12)).max(12).refine(unique, "Each month once"),
  seatsPerDeparture: z.int().min(1).max(MAX_SEATS).nullable(),
  seasons: z.array(seasonToSave).max(12),
  pricesIncludeGst: z.boolean(),
  advancePerPersonPaise: paise.nullable(),
  pickupPoints: text(500),
  startCity: text(80),
  inclusions: text(3000),
  exclusions: text(3000),
  cancellationNotes: text(2000),
  summary: text(600),
  highlights: z.array(text(160).min(1)).max(MAX_HIGHLIGHTS),
  days: z.array(quoteDay).max(Math.min(MAX_DRAFT_DAYS, MAX_QUOTE_DAYS)),
  brochureKnowledgeId: recordId.nullable(),
  /** The draft's fields the owner kept as proposed, for the audit. */
  appliedFields: z.array(z.string().max(40)).max(40),
});
export type CreateGroupPackageInput = z.infer<typeof createGroupPackageInput>;

/** What saving answers: the new package, and what became of the cited brochure ("none" when the draft cited no PDF). */
export const createdGroupPackage = z.object({
  id: recordId,
  brochure: z.enum(["attached", "failed", "none"]),
});
export type CreatedGroupPackage = z.infer<typeof createdGroupPackage>;
