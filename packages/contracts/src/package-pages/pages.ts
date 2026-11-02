// Public package pages (release 7b): the agency's published packages at /a/<sign-in code> and /a/<sign-in code>/<package>, and
// the enquiry a visitor sends from one. What a page shows is what the agency chose to publish: never a cost, a margin, a
// supplier's name or a seat count. Amounts are integer paise.
import { z } from "zod";
import { emailAddress, recordId } from "../identity/fields.js";
import { phoneNumber } from "../kernel/phone.js";
import { calendarMonth } from "../crm/trip.js";
import { calendarDate } from "../kernel/index.js";
import { containsWebAddress } from "../website-forms/enquiry.js";

const text = (max: number) => z.string().trim().max(max);

export const publicPageSettingsFields = {
  /** Whether the agency's package pages are on. Off until the agency decides. */
  enabled: z.boolean(),
  /** A few words about the agency, shown on every page. */
  about: text(1000),
  /** The agency's Instagram page, https only; empty for none. */
  instagramUrl: text(300).refine((url) => url === "" || url.startsWith("https://"), "Use an https address"),
};
export const savePublicPageSettingsInput = z.strictObject(publicPageSettingsFields);
export type SavePublicPageSettingsInput = z.infer<typeof savePublicPageSettingsInput>;
export const publicPageSettings = z.object({
  enabled: z.boolean(),
  about: z.string(),
  instagramUrl: z.string(),
});
export type PublicPageSettings = z.infer<typeof publicPageSettings>;

/** The words a departure shows a visitor, never the seat counts behind them. */
export const publicSeatWords = ["open", "filling", "full"] as const;
export const publicSeatWord = z.enum(publicSeatWords);
export type PublicSeatWord = z.infer<typeof publicSeatWord>;

export const publicAgency = z.object({
  name: z.string(),
  /** The path the agency's pages live under: its sign-in code in lower case. */
  code: z.string(),
  logoUrl: z.string().nullable(),
  /** The agency's colour and the ink that reads on it; null for the product's blue. */
  colour: z.object({ primary: z.string(), ink: z.string() }).nullable(),
  about: z.string(),
  instagramUrl: z.string().nullable(),
  /** E.164, for the call and WhatsApp buttons; null when the agency gave none. */
  phone: z.string().nullable(),
});
export type PublicAgency = z.infer<typeof publicAgency>;

export const publicDeparture = z.object({
  id: recordId,
  startDate: calendarDate,
  endDate: calendarDate,
  word: publicSeatWord,
  /** Per person, if the departure has its own price. */
  pricePaise: z.int().nullable(),
});
export type PublicDeparture = z.infer<typeof publicDeparture>;

/** What a visitor's enquiry needs from the page: the opened token and the bot check's key. */
export const publicEnquiryForm = z.object({
  openedToken: z.string(),
  turnstileSiteKey: z.string().nullable(),
  /** Twelve months from this month, "2026-11". */
  months: z.array(calendarMonth),
  /** What the visitor agrees to by sending. */
  consentLine: z.string(),
});
export type PublicEnquiryForm = z.infer<typeof publicEnquiryForm>;

export const publicPackage = z.object({
  agency: publicAgency,
  package: z.object({
    slug: z.string(),
    name: z.string(),
    summary: z.string(),
    nights: z.int().nullable(),
    destinationName: z.string().nullable(),
    highlights: z.array(z.string()),
    days: z.array(z.object({ title: z.string(), description: z.string() })),
    inclusions: z.string(),
    exclusions: z.string(),
    cancellationNotes: z.string(),
    /** Null for "Price on enquiry". */
    fromPricePaise: z.int().nullable(),
    photos: z.array(z.object({ url: z.string() })),
  }),
  departures: z.array(publicDeparture),
  form: publicEnquiryForm,
});
export type PublicPackage = z.infer<typeof publicPackage>;

export const publicPackageCard = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  nights: z.int().nullable(),
  destinationId: recordId.nullable(),
  destinationName: z.string().nullable(),
  fromPricePaise: z.int().nullable(),
  photoUrl: z.string().nullable(),
});
export type PublicPackageCard = z.infer<typeof publicPackageCard>;
export const publicPackageList = z.object({
  agency: publicAgency,
  packages: z.array(publicPackageCard),
  destinations: z.array(z.object({ id: recordId, name: z.string() })),
});
export type PublicPackageList = z.infer<typeof publicPackageList>;

/** The public GET answers this; `available` false is the plain "not available" page (404). */
export const publicPackageAnswer = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), page: publicPackage }),
  z.object({ available: z.literal(false) }),
]);
export const publicPackageListAnswer = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), page: publicPackageList }),
  z.object({ available: z.literal(false) }),
]);

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !containsWebAddress(value), { message: "Leave web addresses out" });

export const MAX_PACKAGE_MESSAGE = 1000;
export const MAX_JOIN_SEATS = 20;

/** The enquiry, or the request to join a departure (the date fixed, a number of seats). */
export const packageEnquiryInput = z.strictObject({
  /** Made by the page when it loads, sent with every attempt: a double tap or a retry saves once. */
  submissionId: z.uuid(),
  openedToken: z.string().min(1).max(512),
  /** The honeypot: a person leaves it empty. */
  homepage: z.string().max(200),
  turnstileToken: z.string().max(2048).optional(),
  /** The departure the visitor joins, when they do. */
  departureId: z.uuid().optional(),
  answers: z.strictObject({
    name: plainText(120),
    phone: phoneNumber,
    email: emailAddress.optional(),
    /** A month "2026-12", "flexible", or null for not sure yet; ignored when a departure is chosen. */
    travelMonth: z.union([calendarMonth, z.literal("flexible"), z.null()]).optional(),
    /** How many travel (seats, when joining a departure). */
    travellers: z.int().min(1).max(MAX_JOIN_SEATS).optional(),
    message: text(MAX_PACKAGE_MESSAGE).optional(),
  }),
});
export type PackageEnquiryInput = z.infer<typeof packageEnquiryInput>;
