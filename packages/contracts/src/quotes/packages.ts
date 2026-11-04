// Packages (release 7b): a ready trip the agency starts quotes from (reusing the quote template), with tiers (Standard,
// Deluxe) priced from the supplier rates, and the words and photos of its public page. Amounts are integer paise.
import { z } from "zod";
import { travellerLevel } from "../bookings/bookings.js";
import { MAX_PACKAGE_PHOTO_BYTES, packagePhotoContentTypes } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { MAX_SEATS } from "../departures/departures.js";
import { roomPrices, roomType } from "./room-prices.js";
import { MAX_QUOTE_PAISE, quoteDay, quoteItem, quoteTaxRate, MAX_QUOTE_DAYS, MAX_QUOTE_ITEMS } from "./quotes.js";

const text = (max: number) => z.string().trim().max(max);
const paise = z.int().min(0).max(MAX_QUOTE_PAISE);

/** How many of a tier line a quote gets. Rooms are the travellers over two, rounded up. */
export const quantityRules = ["fixed", "per_traveller", "per_night", "per_room_night", "per_person_night"] as const;
export const quantityRule = z.enum(quantityRules);
export type QuantityRule = z.infer<typeof quantityRule>;

export const MAX_TIER_LINES = 30;
export const MAX_TIERS = 5;
export const MAX_PACKAGE_PHOTOS = 6;
export const MAX_HIGHLIGHTS = 10;

/** A tier's line: priced from a rate when it has one, else at its fixed price; neither makes a "needs a rate" line. */
export const tierLine = z.strictObject({
  description: text(200).min(1),
  detail: text(200),
  rateId: recordId.nullable(),
  quantityRule,
  /** Used by "fixed"; the rules that count travellers or nights ignore it. */
  quantity: z.int().min(1).max(1000),
  /** The price of one unit when there is no rate. */
  unitPricePaise: paise,
});
export type TierLine = z.infer<typeof tierLine>;

export const tierFields = { name: text(60).min(1), lines: z.array(tierLine).max(MAX_TIER_LINES) };
export const saveTierInput = z.strictObject({
  packageId: recordId,
  /** Set to change a tier; left out to add one. */
  tierId: recordId.optional(),
  ...tierFields,
});
export type SaveTierInput = z.infer<typeof saveTierInput>;
export const tierIdInput = z.strictObject({ tierId: recordId });

export const packageSlug = z
  .string()
  .trim()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, digits and hyphens");
export const priceDisplays = ["from", "on_enquiry"] as const;
export const priceDisplay = z.enum(priceDisplays);

/** A custom package is quoted trip by trip; a group package sells seats on departures, priced by room type. */
export const packageKinds = ["custom", "group"] as const;
export const packageKind = z.enum(packageKinds);
export type PackageKind = (typeof packageKinds)[number];

const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

export const packageFields = {
  name: text(80).min(1),
  title: text(120).min(1),
  days: z.array(quoteDay).max(MAX_QUOTE_DAYS),
  inclusions: text(3000),
  exclusions: text(3000),
  notes: text(3000),
  taxRateBasisPoints: quoteTaxRate,
  /** The last part of the public address; null until the package has a page. */
  slug: packageSlug.nullable(),
  destinationId: recordId.nullable(),
  nights: z.int().min(0).max(60).nullable(),
  summary: text(600),
  highlights: z.array(text(160).min(1)).max(MAX_HIGHLIGHTS),
  priceDisplay,
  /** Per person, entered by staff; "Calculate from the catalog" only suggests one. */
  fromPricePaise: paise.nullable(),
  defaultTravellerLevel: travellerLevel.nullable(),
  cancellationNotes: text(2000),
  kind: packageKind,
  /** The room types a group package sells. */
  roomTypes: z.array(roomType).max(6).refine(unique, "Each room type once"),
  /** Whether the prices already include GST (the usual way a group trip is advertised). */
  pricesIncludeGst: z.boolean(),
  /** What a person pays to hold a seat, in paise. */
  advancePerPersonPaise: paise.nullable(),
  paymentDetails: text(1000),
  pickupPoints: text(500),
  startCity: text(80),
  /** The days it departs, 0 Sunday to 6 Saturday. */
  weeklyDays: z.array(z.int().min(0).max(6)).max(7).refine(unique, "Each day once"),
  /** The months it departs, 1 to 12; empty means every month. */
  departureMonths: z.array(z.int().min(1).max(12)).max(12).refine(unique, "Each month once"),
  seatsPerDeparture: z.int().min(1).max(MAX_SEATS).nullable(),
};
export const updatePackageInput = z.strictObject({ packageId: recordId, ...packageFields });
export type UpdatePackageInput = z.infer<typeof updatePackageInput>;
export const setPackagePublishedInput = z.strictObject({ packageId: recordId, published: z.boolean() });
export const setPackageSellableInput = z.strictObject({ packageId: recordId, sellable: z.boolean() });
export type SetPackageSellableInput = z.infer<typeof setPackageSellableInput>;

/** What a package still needs before its page can be published. */
export const publishGaps = ["name", "slug", "summary", "photo"] as const;
export type PublishGap = (typeof publishGaps)[number];

/** What a package still needs before the AI may sell it. */
export const sellGaps = ["room_types", "prices", "advance", "departures", "from_price"] as const;
export type SellGap = (typeof sellGaps)[number];

/** A tier's line as the editor reads it: with the name of the rate it prices from ("Hotel Aurora: Deluxe room"), if it has one. */
export const tierLineView = tierLine.extend({ rateLabel: z.string().nullable() });
export type TierLineView = z.infer<typeof tierLineView>;
export const packageTier = z.object({
  id: recordId,
  name: z.string(),
  position: z.int(),
  lines: z.array(tierLineView),
});
export type PackageTier = z.infer<typeof packageTier>;

/** A season of a group package: the dates a set of per-person room prices holds. */
export const packageSeason = z.object({
  id: recordId,
  label: z.string(),
  startsOn: calendarDate,
  endsOn: calendarDate,
  prices: roomPrices,
});
export type PackageSeasonView = z.infer<typeof packageSeason>;

export const savePackageSeasonInput = z
  .strictObject({
    packageId: recordId,
    /** Set to change a season; left out to add one. */
    seasonId: recordId.optional(),
    label: text(60).min(1),
    startsOn: calendarDate,
    endsOn: calendarDate,
    prices: roomPrices,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The season must end on or after its first day",
    path: ["endsOn"],
  })
  .refine((value) => Object.values(value.prices).some((price) => price !== null), {
    message: "Give at least one room type a price",
    path: ["prices"],
  });
export type SavePackageSeasonInput = z.infer<typeof savePackageSeasonInput>;
export const removePackageSeasonInput = z.strictObject({ seasonId: recordId });

export const packageDetail = z.object({
  id: recordId,
  ...z.object(packageFields).shape,
  published: z.boolean(),
  /** The destination's name, for the picker. */
  destinationName: z.string().nullable(),
  /** The lines of a package with no tiers (its one implicit tier); costs only for whoever may see margins. */
  items: z.array(quoteItem).max(MAX_QUOTE_ITEMS),
  tiers: z.array(packageTier),
  /** Group-trip seasons with their room prices, by first day. */
  seasons: z.array(packageSeason),
  photoCount: z.int(),
  /** What is missing to publish; empty when it can be. */
  gaps: z.array(z.enum(publishGaps)),
  /** Whether the AI may sell this package. */
  sellable: z.boolean(),
  /** What is missing before it may; empty when it can be switched on. */
  sellGaps: z.array(z.enum(sellGaps)),
  /** Whether the agency's public pages are switched on at all. */
  pagesEnabled: z.boolean(),
  /** The agency's sign-in code in lower case, the first part of the public address. */
  agencyCode: z.string(),
});
export type PackageDetail = z.infer<typeof packageDetail>;

/** What a member who makes quotes picks from: the package's tiers by name (they need not see the lines or the rates). */
export const packageChoices = z.object({
  tiers: z.array(z.object({ id: recordId, name: z.string() })),
});
export type PackageChoices = z.infer<typeof packageChoices>;

/** One quote for each tier chosen, as options of the same enquiry, priced from the season covering the start date. */
export const makeQuotesFromPackageInput = z.strictObject({
  leadId: recordId,
  packageId: recordId,
  /** Empty for a package with no tiers. */
  tierIds: z.array(recordId).max(MAX_TIERS),
  startDate: calendarDate.nullable(),
});
export type MakeQuotesFromPackageInput = z.infer<typeof makeQuotesFromPackageInput>;
export const madeQuotes = z.object({
  quotes: z.array(z.object({ id: recordId, title: z.string(), needsRateLines: z.int() })),
});
export type MadeQuotes = z.infer<typeof madeQuotes>;

/** The helper beside "From ₹X": the cheapest tier for two adults in the next season, to accept or ignore. */
export const calculatedFromPrice = z.object({
  fromPricePaise: z.int().nullable(),
  tierName: z.string().nullable(),
  /** The first day of the season it was priced for. */
  forDate: calendarDate.nullable(),
});
export type CalculatedFromPrice = z.infer<typeof calculatedFromPrice>;

export const packagePhoto = z.object({ id: recordId, fileName: z.string(), url: z.string().nullable() });
export type PackagePhoto = z.infer<typeof packagePhoto>;
export const packagePhotoList = z.array(packagePhoto);
export const requestPackagePhotoInput = z.strictObject({
  packageId: recordId,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(packagePhotoContentTypes),
  sizeBytes: z.int().min(1).max(MAX_PACKAGE_PHOTO_BYTES),
});
export const packagePhotoRefInput = z.strictObject({ packageId: recordId, attachmentId: z.uuid() });
