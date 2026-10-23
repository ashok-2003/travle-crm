// The words a file holds for the fixed lists (D29, B11, B20): the screen's word first, which an export writes, then the
// words a sheet may use instead, which an import reads. Case, spaces, dashes and underscores don't count, so the stored
// key ("quote_sent") reads too. A web test holds each first word equal to the Leads screens' (leads.json).
import type { BudgetBasis, FoodPreference, HotelCategory, LeadSource, LeadStage, TripType } from "./fields.js";

type Words<Key extends string> = Readonly<Record<Key, readonly [string, ...string[]]>>;

const starWords = (stars: number) =>
  [`${String(stars)}★`, `${String(stars)} star`, `${String(stars)}-star`, `${String(stars)} stars`] as const;

export const leadFileWords: {
  stage: Words<LeadStage>;
  tripType: Words<TripType>;
  hotelCategory: Words<HotelCategory>;
  food: Words<FoodPreference>;
  budgetBasis: Words<BudgetBasis>;
  source: Words<LeadSource>;
} = {
  stage: {
    new: ["New"],
    contacted: ["Contacted", "Called", "Follow up", "In progress"],
    quote_sent: ["Quote sent", "Quoted"],
    booking_requested: ["Booking requested"],
    won: ["Won", "Booked", "Confirmed", "Converted"],
    lost: ["Lost", "Not interested", "Dropped", "Cancelled"],
    not_a_lead: ["Not a lead", "Junk", "Spam", "Fake"],
  },
  tripType: {
    family: ["Family"],
    honeymoon: ["Honeymoon"],
    friends: ["Friends"],
    solo: ["Solo"],
    corporate: ["Corporate"],
    pilgrimage: ["Pilgrimage"],
    trek: ["Trek"],
  },
  hotelCategory: { "3_star": starWords(3), "4_star": starWords(4), "5_star": starWords(5), any: ["Any"] },
  food: {
    veg: ["Vegetarian", "veg"],
    jain: ["Jain"],
    non_veg: ["Non-vegetarian", "non veg", "non-veg", "nonveg"],
  },
  budgetBasis: { per_person: ["per person", "pp", "per head"], for_everyone: ["for everyone", "total"] },
  source: {
    phone_call: ["Phone call"],
    walk_in: ["Walk-in"],
    referral: ["Referral"],
    instagram: ["Instagram"],
    facebook: ["Facebook"],
    website: ["Website"],
    other: ["Other"],
    google_sheet: ["Google Sheet"],
    bulk_upload: ["Import"],
    web_form: ["Website form"],
    integration: ["Another tool"],
    meta_lead_ad: ["Facebook or Instagram lead ad", "Meta lead ad"],
    whatsapp: ["WhatsApp"],
    package_page: ["Package page"],
  },
};

export type FileWordField = keyof typeof leadFileWords;

/** A word as compared: lower case, without spaces, dashes or underscores. */
const comparable = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");

const keysByWord = new Map(
  Object.entries(leadFileWords).map(([field, words]) => {
    const keys = new Map<string, string>();
    for (const [key, all] of Object.entries(words) as [string, readonly string[]][]) {
      for (const word of [key, ...all]) keys.set(comparable(word), key);
    }
    return [field, keys] as const;
  }),
);

/** The word a file shows for a key: "Quote sent" for quote_sent. */
export function wordOf(field: FileWordField, key: string): string {
  const words = leadFileWords[field] as Readonly<Record<string, readonly string[]>>;
  return words[key]?.[0] ?? key;
}

/** The key a file's word stands for, or null: "Booked" is won, "4 stars" is 4_star, "Thinking about it" is null. */
export function keyOfWord(field: FileWordField, text: string): string | null {
  const word = comparable(text.trim());
  return word === "" ? null : (keysByWord.get(field)?.get(word) ?? null);
}
