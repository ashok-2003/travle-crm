// The trip menu (the owner, 2026-11-24): a WhatsApp list code builds from the turn's trip sheets, one row per
// destination with the soonest departure first, so no trip on it is the model's. `show_trips` stages it, at most once a
// day in a chat, and the act sends it after the model's words; the chat then shows it as a mark, and a pick as a line.
import { calendarDateIn, formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import { languageOf } from "../natural/language-of.js";
import type { ActionContext, StageOutcome } from "../natural/tools/action-tools.js";
import { isText } from "../natural/trips/trip-text.js";
import type { NaturalChatLine, TripMenu, TripSheet } from "../natural/types.js";

/** A row's id starts with this, so a customer's pick is told from any other list's. */
export const MENU_ROW_PREFIX = "trips:";
/** How the chat writes a menu that went: "sent: trip menu: Manali, Spiti". */
export const MENU_SENT = "sent: trip menu";
/** WhatsApp's limits (`LIST_LIMITS`): ten rows, a title of 24 characters and a line under it of 72. */
const MOST_ROWS = 10;
const TITLE_MOST = 24;
const LINE_MOST = 72;
/** The customer's latest lines that set the menu's language, as a tap's fixed line reads them. */
const LATEST_LINES = 3;

const WORDS = {
  english: { body: "Pick a trip, we'll send its plan.", button: "See trips", other: "Something else" },
  hinglish: { body: "Trip chuniye, hum uska plan bhej denge.", button: "Trips dekho", other: "Kuch aur" },
  hindi: { body: "ट्रिप चुनिए, हम उसका प्लान भेज देंगे।", button: "ट्रिप देखें", other: "कुछ और" },
} as const;

export const menuSentWords = (titles: readonly string[]) => `${MENU_SENT}: ${titles.join(", ")}`;

/** `text` on one line, cut at a word to fit `most` with an ellipsis; a first word too long is cut inside. */
function cutClean(text: string, most: number): string {
  const whole = text.replace(/\s+/gu, " ").trim();
  if (whole.length <= most) return whole;
  const room = whole.slice(0, most - 1);
  const space = whole.charAt(most - 1) === " " ? room.length : room.lastIndexOf(" ");
  return `${(space > 0 ? room.slice(0, space) : room).replace(/[\s,;:·-]+$/u, "")}…`;
}

interface Destination {
  id: string;
  title: string;
  sheets: TripSheet[];
}

/** The sheets by destination: its id, else the place's words; a trip with neither stands alone. */
function destinationsOf(sheets: readonly TripSheet[]): Destination[] {
  const byKey = new Map<string, Destination>();
  for (const sheet of sheets) {
    const place = sheet.place?.trim() ?? "";
    const key = sheet.destinationId ?? (place === "" ? sheet.packageId : `place:${place.toLowerCase()}`);
    const known = byKey.get(key);
    if (known !== undefined) known.sheets.push(sheet);
    else {
      // The id names the destination, or the first trip when it has none: ids only, never a place's words.
      const id = `${MENU_ROW_PREFIX}${sheet.destinationId ?? sheet.packageId}`;
      byKey.set(key, { id, title: place === "" ? sheet.title : place, sheets: [sheet] });
    }
  }
  return [...byKey.values()];
}

const soonestOf = (destination: Destination): CalendarDate | null =>
  destination.sheets
    .flatMap((sheet) => sheet.departures.map((departure) => departure.startsOn))
    .reduce<CalendarDate | null>((soonest, day) => (soonest === null || day < soonest ? day : soonest), null);

/** "2 trips · from ₹5,999 · next Fri 27 Nov". */
function lineOf(destination: Destination, today: CalendarDate): string {
  const count = destination.sheets.length;
  const prices = destination.sheets.flatMap((sheet) => (sheet.fromPaise === null ? [] : [sheet.fromPaise]));
  const soonest = soonestOf(destination);
  return cutClean(
    [
      `${String(count)} ${count === 1 ? "trip" : "trips"}`,
      prices.length === 0 ? null : `from ${formatRupees(Math.min(...prices))}`,
      soonest === null ? null : `next ${formatShortDay(soonest, today)}`,
    ]
      .filter(isText)
      .join(" · "),
    LINE_MOST,
  );
}

/** The menu: the destinations soonest first (those with no open date last), nine and Something else past ten. */
export function tripMenu(
  sheets: readonly TripSheet[],
  today: CalendarDate,
  language: "hindi" | "hinglish" | "english",
): TripMenu {
  const words = WORDS[language];
  // Days in yyyy-mm-dd sort as text; a destination with no open date goes last, and the sort keeps ties in order.
  const order = (destination: Destination) => soonestOf(destination) ?? "9999-12-31";
  const destinations = destinationsOf(sheets).sort((one, other) => order(one).localeCompare(order(other)));
  const shown = destinations.length > MOST_ROWS ? destinations.slice(0, MOST_ROWS - 1) : destinations;
  const rest = destinations.slice(shown.length);
  const rows = shown.map((destination) => ({
    id: destination.id,
    title: cutClean(destination.title, TITLE_MOST),
    description: lineOf(destination, today),
  }));
  const other = {
    id: `${MENU_ROW_PREFIX}other`,
    title: words.other,
    description: cutClean(rest.map((destination) => destination.title).join(", "), LINE_MOST),
  };
  return { body: words.body, button: words.button, rows: rest.length === 0 ? rows : [...rows, other] };
}

/** A menu that went, as the live chat writes it (the message's action) or Try it's (the mark in its words). */
function isMenu(line: NaturalChatLine): boolean {
  return line.from === "you" && (line.action ?? line.text.replace(/^\[/u, "")).startsWith(MENU_SENT);
}

/** `show_trips`: the menu staged for the act to send after the words, or refused when one went today. */
export function stageTripMenu(context: Pick<ActionContext, "sheets" | "today" | "timeZone" | "lines">): StageOutcome {
  const { sheets, today, timeZone, lines } = context;
  if (sheets.length === 0) return { refused: "refused: the agency has no trips on sale to show" };
  if (lines.some((line) => isMenu(line) && calendarDateIn(line.at, timeZone) === today)) {
    return {
      refused:
        "refused: the trip menu went to this chat today already; name the trips in words, or send the brochure of " +
        "the one they named",
    };
  }
  const theirs = lines.filter((line) => line.from === "customer").slice(-LATEST_LINES);
  const menu = tripMenu(sheets, today, languageOf(theirs.map((line) => line.text).join("\n")));
  const titles = menu.rows.map((row) => row.title).join(", ");
  return {
    staged: { tool: "show_trips", menu },
    result:
      `the app sends the trip menu after your words, a list they tap: ${titles}. Don't list these trips in your ` +
      "words too; their pick comes back as their message.",
  };
}
