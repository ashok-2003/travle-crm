// The agency's side of the website form (spec 4.1, 7.1): the settings it saves, what the settings page reads back, and the
// state that says why a form is closed. Inputs are strict objects; outputs strip unknown keys.
import { z } from "zod";

export const fieldModes = ["off", "optional", "required"] as const;
export const fieldMode = z.enum(fieldModes);
export type FieldMode = z.infer<typeof fieldMode>;

/** Why a form is closed, in the order the checks run (W6, W7, F14). */
export const formClosedReasons = ["off", "read_only", "suspended", "cancelled", "plan", "demo", "no_owner"] as const;

export const formState = z.object({
  open: z.boolean(),
  reason: z.enum(formClosedReasons).nullable(),
});
export type FormState = z.infer<typeof formState>;

/** Lengths of the agency's words (W3), the same as the table's CHECKs. */
export const formTextLimits = {
  heading: 80,
  introduction: 200,
  thankYouMessage: 500,
  websiteButtonText: 40,
  url: 300,
} as const;

/** Plain text of at most `max` characters; empty is "not set". Never HTML: it is shown as text everywhere. */
const words = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === "" ? null : text))
    .nullable();

/** An address the visitor can follow: https only (FORM_LINK_INVALID), empty is "not set". */
const secureLink = z
  .string()
  .trim()
  .max(formTextLimits.url)
  .transform((text) => (text === "" ? null : text))
  .nullable()
  .refine((link) => link === null || isSecureLink(link), { message: "FORM_LINK_INVALID" });

function isSecureLink(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const settingsFields = {
  allowEmbed: z.boolean(),
  emailMode: fieldMode,
  destinationMode: fieldMode,
  travelMonthMode: fieldMode,
  travellersMode: fieldMode,
  budgetMode: fieldMode,
  messageMode: fieldMode,
  offersTickbox: z.boolean(),
};

/** What the settings page reads: the saved values, the agency's words as stored. */
export const websiteFormSettings = z.object({
  enabled: z.boolean(),
  ...settingsFields,
  heading: z.string().nullable(),
  introduction: z.string().nullable(),
  thankYouMessage: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  websiteButtonText: z.string().nullable(),
  privacyUrl: z.string().nullable(),
});
export type WebsiteFormSettings = z.infer<typeof websiteFormSettings>;

/** What Save sends: everything but `enabled`, which Turn on and Turn off own. */
export const saveWebsiteFormInput = z.strictObject({
  ...settingsFields,
  heading: words(formTextLimits.heading),
  introduction: words(formTextLimits.introduction),
  thankYouMessage: words(formTextLimits.thankYouMessage),
  websiteUrl: secureLink,
  websiteButtonText: words(formTextLimits.websiteButtonText),
  privacyUrl: secureLink,
});
export type SaveWebsiteFormInput = z.infer<typeof saveWebsiteFormInput>;

/** The settings page: the settings (defaults when no form was saved yet), the links, why the form is closed, the Owner. */
export const websiteFormView = z.object({
  settings: websiteFormSettings,
  /** Null until the form is first saved: opening the page writes nothing (W1). */
  key: z.string().nullable(),
  link: z.string().nullable(),
  embedLink: z.string().nullable(),
  state: formState,
  /** The Owner the leads go to (W7), null when there is none. */
  ownerName: z.string().nullable(),
});
export type WebsiteFormView = z.infer<typeof websiteFormView>;

/** The settings page's "Last 30 days". */
export const formCountsView = z.object({
  enquiries: z.int().min(0),
  newLeads: z.int().min(0),
  repeatEnquiries: z.int().min(0),
  stopped: z.int().min(0),
});
export type FormCountsView = z.infer<typeof formCountsView>;
