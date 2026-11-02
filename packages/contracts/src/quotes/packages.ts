// Packages (release 7b): a ready trip the agency starts quotes from (reusing the quote template), with tiers (Standard,
// Deluxe) priced from the supplier rates, and the words and photos of its public page. Amounts are integer paise.
import { z } from "zod";
import { travellerLevel } from "../bookings/bookings.js";
import { MAX_PACKAGE_PHOTO_BYTES, packagePhotoContentTypes } from "../files/attachments.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
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
};
export const updatePackageInput = z.strictObject({ packageId: recordId, ...packageFields });
export type UpdatePackageInput = z.infer<typeof updatePackageInput>;
export const setPackagePublishedInput = z.strictObject({ packageId: recordId, published: z.boolean() });

/** What a package still needs before its page can be published. */
export const publishGaps = ["name", "slug", "summary", "photo"] as const;
export type PublishGap = (typeof publishGaps)[number];

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

export const packageDetail = z.object({
  id: recordId,
  ...z.object(packageFields).shape,
  published: z.boolean(),
  /** The destination's name, for the picker. */
  destinationName: z.string().nullable(),
  /** The lines of a package with no tiers (its one implicit tier); costs only for whoever may see margins. */
  items: z.array(quoteItem).max(MAX_QUOTE_ITEMS),
  tiers: z.array(packageTier),
  photoCount: z.int(),
  /** What is missing to publish; empty when it can be. */
  gaps: z.array(z.enum(publishGaps)),
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
