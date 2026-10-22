// Field rules for people and leads (spec 3.2, 4): the fixed lists every agency shares, so reports compare, and how a
// person's name and contacts are typed and stored. Stored values are snake_case words; the web app has their words.
import { z } from "zod";
import { emailAddress, recordId } from "../identity/fields.js";
import { phoneNumber } from "../kernel/phone.js";

export { emailAddress };

/** Every stage, in the order a lead moves through them. Won, Lost and Not a lead are closed. */
export const leadStages = ["new", "contacted", "quote_sent", "booking_requested", "won", "lost", "not_a_lead"] as const;
export const leadStage = z.enum(leadStages);
export type LeadStage = z.infer<typeof leadStage>;

export const openLeadStages = ["new", "contacted", "quote_sent", "booking_requested"] as const;
export const openLeadStage = z.enum(openLeadStages);
export type OpenLeadStage = z.infer<typeof openLeadStage>;

export const closedLeadStages = ["won", "lost", "not_a_lead"] as const;

/** The lead page's bar: New → Contacted → Quote sent → Booking requested → Won. */
export const stageBarStages = ["new", "contacted", "quote_sent", "booking_requested", "won"] as const;

export function isOpenStage(stage: LeadStage): stage is OpenLeadStage {
  return (openLeadStages as readonly string[]).includes(stage);
}

export const tripTypes = ["family", "honeymoon", "friends", "solo", "corporate", "pilgrimage", "trek"] as const;
export const tripType = z.enum(tripTypes);
export type TripType = z.infer<typeof tripType>;

/** 3★, 4★, 5★ or any. */
export const hotelCategories = ["3_star", "4_star", "5_star", "any"] as const;
export const hotelCategory = z.enum(hotelCategories);
export type HotelCategory = z.infer<typeof hotelCategory>;

export const foodPreferences = ["veg", "jain", "non_veg"] as const;
export const foodPreference = z.enum(foodPreferences);
export type FoodPreference = z.infer<typeof foodPreference>;

/** A budget is per person or for everyone travelling. */
export const budgetBases = ["per_person", "for_everyone"] as const;
export const budgetBasis = z.enum(budgetBases);
export type BudgetBasis = z.infer<typeof budgetBasis>;

/** How a person is reached and found again. */
export const contactKinds = ["phone", "email", "instagram"] as const;
export const contactKind = z.enum(contactKinds);
export type ContactKind = z.infer<typeof contactKind>;

/** Where a lead came from: the form's seven, then the sources later releases bring. The lead table checks the same. */
export const leadSources = [
  "phone_call",
  "walk_in",
  "referral",
  "instagram",
  "facebook",
  "website",
  "other",
  "google_sheet",
  "bulk_upload",
  "web_form",
  "integration",
  "meta_lead_ad",
  "whatsapp",
  "package_page",
] as const;
export const leadSource = z.enum(leadSources);
export type LeadSource = z.infer<typeof leadSource>;

/** The sources staff choose from when they add a lead by hand. */
export const handLeadSources = [
  "phone_call",
  "walk_in",
  "referral",
  "instagram",
  "facebook",
  "website",
  "other",
] as const satisfies readonly LeadSource[];
export const handLeadSource = z.enum(handLeadSources);
export type HandLeadSource = z.infer<typeof handLeadSource>;

/** A customer's name as they gave it, in any script: 1-120 characters. */
export const personName = z.string().trim().min(1, "Give their name").max(120);

/** An Instagram handle as typed: one leading "@" dropped, stored in lower case. */
export const instagramHandle = z
  .string()
  .max(40)
  .transform((text) => text.trim().replace(/^@/, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9._]{1,30}$/, "Use a handle like rahul.sharma"));

/** A person's contacts; each is optional, and at least one is required where a person is given. */
export const personContactFields = {
  phone: phoneNumber.optional(),
  email: emailAddress.optional(),
  instagramHandle: instagramHandle.optional(),
};

const hasContact = (contacts: { phone?: unknown; email?: unknown; instagramHandle?: unknown }) =>
  contacts.phone !== undefined || contacts.email !== undefined || contacts.instagramHandle !== undefined;

const contactRequired = { message: "Give a phone, an email or an Instagram handle", path: ["phone"] };

/** At least one of phone, email or Instagram handle: what a known-contact check asks about. */
export const personContacts = z.strictObject(personContactFields).refine(hasContact, contactRequired);
export type PersonContacts = z.infer<typeof personContacts>;

/** A person as the lead form and the person editor give them: a name and at least one contact. */
export const newPerson = z
  .strictObject({ name: personName, ...personContactFields })
  .refine(hasContact, contactRequired);
export type NewPerson = z.infer<typeof newPerson>;

/** A short line of text: a departure city, a room type, a source's detail. */
export const shortText = z.string().trim().min(1).max(120);

/** A note's text: 1-4000 characters. */
export const noteBody = z.string().trim().min(1, "Write the note").max(4000);

/** Names of the people a page mentions, by user id. An id missing from it is a former member. */
export const peopleNames = z.record(recordId, z.string());
export type PeopleNames = z.infer<typeof peopleNames>;
