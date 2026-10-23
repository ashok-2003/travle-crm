// What the public GET hands a visitor's page and the settings Preview (spec 7.4): the form as the visitor sees it, or, when
// it is closed, only the agency's name, logo and website button.
import { z } from "zod";
import { calendarMonth } from "../crm/trip.js";
import { destinationInput, fieldMode } from "./settings.js";

/** Which page asks: the hosted link or the embed on an agency's own site. A fixed value, so it may sit in a URL. */
export const formVia = z.enum(["hosted", "embedded"]);
export type FormVia = z.infer<typeof formVia>;

/** The public GET's query: the page that asks (an embed with embedding off gets the closed card). */
export const publicFormQuery = z.strictObject({ via: formVia });
export type PublicFormQuery = z.infer<typeof publicFormQuery>;

export const publicForm = z.object({
  organizationName: z.string(),
  logoUrl: z.string().nullable(),
  /** The agency's colour and the ink that reads on it; null for the product's blue (spec 8). */
  colour: z.object({ primary: z.string(), ink: z.string() }).nullable(),
  heading: z.string().nullable(),
  introduction: z.string().nullable(),
  thankYouMessage: z.string(),
  websiteUrl: z.string().nullable(),
  websiteButtonText: z.string().nullable(),
  privacyUrl: z.string().nullable(),
  fields: z.object({
    email: fieldMode,
    destination: fieldMode,
    travelMonth: fieldMode,
    travellers: fieldMode,
    budget: fieldMode,
    message: fieldMode,
  }),
  /** "typed" shows a text box and sends no list. */
  destinationInput,
  offersTickbox: z.boolean(),
  offersWording: z.string().nullable(),
  destinations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Twelve months from this month in the agency's zone, "2026-11". */
  months: z.array(calendarMonth),
  openedToken: z.string(),
  turnstileSiteKey: z.string().nullable(),
});
export type PublicForm = z.infer<typeof publicForm>;

/** A closed form shows no fields: the agency's name, logo and the way back to its website. */
export const closedPublicForm = z.object({
  organizationName: z.string(),
  logoUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  websiteButtonText: z.string().nullable(),
});
export type ClosedPublicForm = z.infer<typeof closedPublicForm>;

/** `available` says which: a form to fill in, or the closed card. */
export const websiteFormPublic = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), form: publicForm }),
  z.object({ available: z.literal(false), form: closedPublicForm }),
]);
export type WebsiteFormPublic = z.infer<typeof websiteFormPublic>;
