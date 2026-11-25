// The trip menu: code builds the WhatsApp list from the turn's trip sheets (one row per destination, the soonest
// departure first, ten rows at most), in the customer's language, within WhatsApp's limits; show_trips stages it, once a
// day in a chat.
import { LIST_LIMITS } from "@travel-crm/integrations/whatsapp";
import { describe, expect, it } from "vitest";
import type { TripSheet } from "../../../src/ai/natural/types.js";
import { stageTripMenu, tripMenu } from "../../../src/ai/one/trip-menu.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { ctx, hoursAgo, line, sheet, today } from "../natural/fixtures.js";

/** A sheet of trip `number` at `place`, from `fromPaise`, with open departures on `days`. */
function trip(
  number: number,
  place: string | null,
  options: { destinationId?: string | null; days?: string[]; fromPaise?: number | null } = {},
): TripSheet {
  const { days = [], fromPaise = 599_900 } = options;
  return {
    ...sheet(number, `Trip ${String(number)}`, place ?? "", []),
    place,
    destinationId: options.destinationId === undefined ? `destination-${String(number)}` : options.destinationId,
    fromPaise,
    departures: days.map((day, index) => ({
      id: `departure-${String(number)}-${String(index)}`,
      startsOn: parseCalendarDate(day),
      freeSeats: 10,
      priceFrom: "season" as const,
      perPersonPaise: {},
    })),
  };
}

describe("the trip menu", () => {
  it("gives one row per destination, the soonest departure first, with its trips, lowest price and next day", () => {
    const menu = tripMenu(
      [
        trip(1, "Spiti", { days: ["2026-12-05"] }),
        trip(2, "Manali", { destinationId: "destination-manali", days: ["2026-11-28"], fromPaise: 799_900 }),
        trip(3, "Manali", { destinationId: "destination-manali", days: ["2026-11-27"] }),
        trip(4, "Kashmir"),
        // No destination: grouped by the place's words.
        trip(5, "Goa", { destinationId: null, days: ["2026-12-01"] }),
        trip(6, "goa ", { destinationId: null, days: ["2026-11-30"], fromPaise: null }),
      ],
      today,
      "english",
    );
    expect(menu.rows).toEqual([
      { id: "trips:destination-manali", title: "Manali", description: "2 trips · from ₹5,999 · next Fri 27 Nov" },
      { id: "trips:package-5", title: "Goa", description: "2 trips · from ₹5,999 · next Mon 30 Nov" },
      { id: "trips:destination-1", title: "Spiti", description: "1 trip · from ₹5,999 · next Sat 5 Dec" },
      { id: "trips:destination-4", title: "Kashmir", description: "1 trip · from ₹5,999" },
    ]);
    expect(menu).toMatchObject({ body: "Pick a trip, we'll send its plan.", button: "See trips" });
  });

  it("names a trip with no place by its title, and cuts a long place at a word", () => {
    const menu = tripMenu(
      [trip(1, null), trip(2, "Spiti Valley Winter Expedition Circuit"), trip(3, "Kanyakumarirameshwaramtour")],
      today,
      "english",
    );
    expect(menu.rows.map((row) => row.title)).toEqual(["Trip 1", "Spiti Valley Winter…", "Kanyakumarirameshwaramt…"]);
  });

  it("shows nine destinations and Something else, naming the rest, when there are more than ten", () => {
    const places = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "Jaipur", "Kerala", "Ladakh"];
    const sheets = places.map((place, index) => trip(index + 1, place, { days: [`2026-12-${String(index + 10)}`] }));
    const menu = tripMenu(sheets, today, "english");
    expect(menu.rows).toHaveLength(10);
    expect(menu.rows.slice(0, 9).map((row) => row.title)).toEqual(places.slice(0, 9));
    expect(menu.rows[9]).toEqual({ id: "trips:other", title: "Something else", description: "Jaipur, Kerala, Ladakh" });
    // Ten destinations fit as they are.
    expect(tripMenu(sheets.slice(0, 10), today, "english").rows.at(-1)?.title).toBe("Jaipur");
  });

  it("keeps every part within WhatsApp's limits", () => {
    const long = "Kanyakumari Rameshwaram Madurai Temple Trail ".repeat(3);
    const sheets = Array.from({ length: 14 }, (_, index) =>
      trip(index + 1, `${long}${String(index)}`, { days: ["2027-12-31"], fromPaise: 10_000_000_00 }),
    );
    const menu = tripMenu(sheets, today, "hindi");
    expect(menu.rows).toHaveLength(LIST_LIMITS.rows);
    expect(menu.button.length).toBeLessThanOrEqual(LIST_LIMITS.button);
    for (const row of menu.rows) {
      expect(row.title.length).toBeLessThanOrEqual(LIST_LIMITS.title);
      expect(row.description?.length ?? 0).toBeLessThanOrEqual(LIST_LIMITS.description);
      expect(row.id.length).toBeLessThanOrEqual(LIST_LIMITS.id);
      expect(row.id).toMatch(/^trips:\S+$/u);
    }
  });

  it("writes its fixed words in the customer's language", () => {
    const words = (language: "english" | "hinglish" | "hindi") => {
      const sheets = Array.from({ length: 11 }, (_, index) => trip(index + 1, `Place ${String(index)}`));
      const { body, button, rows } = tripMenu(sheets, today, language);
      return { body, button, other: rows.at(-1)?.title };
    };
    expect(words("hinglish")).toEqual({
      body: "Trip chuniye, hum uska plan bhej denge.",
      button: "Trips dekho",
      other: "Kuch aur",
    });
    expect(words("hindi")).toEqual({
      body: "ट्रिप चुनिए, हम उसका प्लान भेज देंगे।",
      button: "ट्रिप देखें",
      other: "कुछ और",
    });
  });
});

describe("show_trips", () => {
  it("stages the menu in the language of the customer's latest lines, and tells the model what goes", () => {
    const outcome = stageTripMenu(ctx());
    if (!("staged" in outcome)) throw new Error(outcome.refused);
    expect(outcome.staged).toMatchObject({
      tool: "show_trips",
      menu: { button: "Trips dekho", rows: [{ title: "Sankri, Uttarakhand" }, { title: "Lohajung" }] },
    });
    expect(outcome.result).toContain("Sankri, Uttarakhand, Lohajung");
  });

  it("refuses a second menu in a chat on the same day, as the live chat and Try it show the first", () => {
    const live = { ...line("you", "Pick a trip", 60), action: "sent: trip menu: Sankri, Lohajung" };
    const tryIt = line("you", "[sent: trip menu: Sankri, Lohajung]", 60);
    for (const sent of [live, tryIt]) {
      const outcome = stageTripMenu(ctx({ lines: [sent, line("customer", "hello", 1)] }));
      expect("refused" in outcome ? outcome.refused : "").toMatch(/^refused: the trip menu went to this chat today/u);
    }
    // Yesterday's menu (the fixture's clock is 11:43 pm in Kolkata) doesn't count.
    const yesterday = { ...live, at: hoursAgo(24) };
    expect("staged" in stageTripMenu(ctx({ lines: [yesterday, line("customer", "hello", 1)] }))).toBe(true);
  });
});
