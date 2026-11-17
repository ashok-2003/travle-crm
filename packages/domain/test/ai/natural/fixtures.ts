// Natural's action fixtures, shared by the action tests of both agents: two trip sheets, a chat, a lead and a fake quote.
import { naturalFacts, type BookingTerms, type NaturalFacts } from "@travel-crm/contracts/ai";
import type { ActionContext } from "../../../src/ai/natural/tools/action-tools.js";
import type { NaturalChatLine, NaturalLeadView, QuoteFigures, TripSheet } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

export const zone = "Asia/Kolkata";
// Sat 14 Nov 2026, 11:43 pm in Kolkata.
export const now = new Date("2026-11-14T18:13:00Z");
export const today = parseCalendarDate("2026-11-14");
export const MINUTE = 60_000;
export const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);
export const hoursAgo = (hours: number) => minutesAgo(hours * 60);

export function sheet(number: number, title: string, place: string, fileIds: string[]): TripSheet {
  return {
    label: `T${String(number)}`,
    packageId: `package-${String(number)}`,
    title,
    place,
    destinationId: `destination-${String(number)}`,
    nights: 5,
    startCity: "Dehradun",
    summary: `${title}: a winter trek.`,
    highlights: [],
    days: [],
    pickups: [],
    inclusions: "",
    exclusions: "",
    notes: "",
    cancellation: "",
    rooms: ["double", "triple"],
    seasons: [],
    pricesIncludeGst: true,
    taxRateBasisPoints: 500,
    fromPaise: 949_900,
    advancePerPersonPaise: 300_000,
    departures: [],
    fileIds,
  };
}
export const kedarkantha = sheet(1, "Kedarkantha Trek", "Sankri, Uttarakhand", [
  "brochure-1",
  "photo-1",
  "photo-2",
  "photo-3",
]);
export const brahmatal = sheet(2, "Brahmatal Trek", "Lohajung", ["brochure-2"]);

export let lineCount = 0;
export function line(from: NaturalChatLine["from"], text: string, minutes: number): NaturalChatLine {
  lineCount += 1;
  return { id: `line-${String(lineCount)}`, from, at: minutesAgo(minutes), kind: "text", text };
}

export const facts = (over: Partial<NaturalFacts> = {}): NaturalFacts => ({
  ...naturalFacts.parse({ agent: "natural" }),
  ...over,
});
export const lead: NaturalLeadView = {
  name: "",
  cameFrom: "WhatsApp",
  packageId: null,
  day: null,
  month: null,
  adults: null,
  childrenAges: [],
  pickupCity: null,
  room: null,
  stage: "new",
  summary: null,
  teamNotes: [],
  openTasks: [],
};

export const perPerson: Partial<Record<string, number>> = { double: 1_299_900, triple: 949_900 };
/** The fake quote: ₹12,999 double and ₹9,499 triple per person, ₹3,000 advance each; no room asked is triple. */
export function quoteOf(terms: BookingTerms): Promise<QuoteFigures> {
  const room = terms.room ?? "triple";
  const party = terms.adults + terms.childrenAges.length;
  const price = perPerson[room] ?? 0;
  return Promise.resolve({
    terms: { ...terms, room },
    departureId: `departure-${terms.startsOn}`,
    perPersonPaise: price,
    totalPaise: price * party,
    advancePaise: 300_000 * party,
    advancePerPersonPaise: 300_000,
    freeSeats: 20,
  });
}

export const firstLine = line("customer", "Hi, December mein koi trek hai?", 1);
export function ctx(over: Partial<ActionContext> = {}): ActionContext {
  return {
    sheets: [kedarkantha, brahmatal],
    labels: new Map([
      ["T1", "package-1"],
      ["T2", "package-2"],
    ]),
    today,
    now,
    timeZone: zone,
    conversationId: "conversation-1",
    facts: facts(),
    lead,
    typed: {},
    lines: [firstLine],
    newLines: [firstLine],
    lastInboundAt: firstLine.at,
    adPackageId: null,
    quotedThisTurn: [],
    paymentReady: true,
    booking: null,
    profileName: null,
    quoteOf,
    ...over,
  };
}

/** A chat whose newest line is the customer's `said`, as the turn's one new line. */
export function saying(said: string, earlier: NaturalChatLine[] = []): Partial<ActionContext> {
  const answer = line("customer", said, 1);
  return { lines: [...earlier, answer], newLines: [answer], lastInboundAt: answer.at };
}
