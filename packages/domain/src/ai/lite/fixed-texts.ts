// Fills the fixed texts: code's own words in the customer's language, with every filled value's span recorded so the
// reply check skips it. Also the small words code writes for a party, a room and a hold's end.
import type { LiteLanguage } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import { calendarDateIn, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import type { Found } from "../grounded/phrase-match.js";
import { fixedTextTable } from "./fixed-text-table.js";
import type { FixedTextKey } from "./types.js";

const SLOT = /\{(\w+)\}/g;

/** The text of a key with its `{slots}` filled; a slot with no value throws (a bug in the caller, never sent). */
export function fixedText(
  key: FixedTextKey,
  language: LiteLanguage,
  values: Readonly<Record<string, string>>,
): { text: string; filled: Found[] } {
  const template = fixedTextTable[key][language];
  let text = "";
  let last = 0;
  const filled: Found[] = [];
  for (const match of template.matchAll(SLOT)) {
    const value = values[match[1] ?? ""];
    if (value === undefined) throw new RangeError(`Fixed text ${key} has no value for {${match[1] ?? ""}}`);
    text += template.slice(last, match.index);
    filled.push({ start: text.length, end: text.length + value.length });
    text += value;
    last = match.index + match[0].length;
  }
  return { text: text + template.slice(last), filled };
}

const hindiCount = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** "3 adults, 1 child" / "3 वयस्क, 1 बच्चा"; Hinglish reads as English. */
export function travellersWords(adults: number, children: number, language: LiteLanguage): string {
  const hindi = language === "hindi";
  const adultWords = hindi ? `${String(adults)} वयस्क` : `${String(adults)} ${adults === 1 ? "adult" : "adults"}`;
  if (children <= 0) return adultWords;
  const childWords = hindi
    ? `${String(children)} ${hindiCount(children, "बच्चा", "बच्चे")}`
    : `${String(children)} ${children === 1 ? "child" : "children"}`;
  return `${adultWords}, ${childWords}`;
}

const englishRooms: Partial<Record<RoomType, string>> = {
  single: "single room",
  double: "double sharing",
  triple: "triple sharing",
  quad: "quad sharing",
};
const hindiRooms: Partial<Record<RoomType, string>> = {
  single: "सिंगल रूम",
  double: "डबल शेयरिंग",
  triple: "ट्रिपल शेयरिंग",
  quad: "क्वाड शेयरिंग",
};

/** A room type in the customer's words; a type that is not a room an adult takes is named as written. */
export function roomWords(room: RoomType, language: LiteLanguage): string {
  return (language === "hindi" ? hindiRooms : englishRooms)[room] ?? room.replace(/_/g, " ");
}

/** A hold's end in the agency's zone: "Mon 16 Nov, 6 pm" (minutes only when they are not zero). */
export function holdUntilWords(at: Date, today: CalendarDate, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hourCycle: "h12" })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  const minutes = parts.minute === "00" ? "" : `:${parts.minute ?? ""}`;
  const clock = `${parts.hour ?? ""}${minutes} ${(parts.dayPeriod ?? "").toLowerCase()}`;
  return `${formatShortDay(calendarDateIn(at, timeZone), today)}, ${clock}`;
}
