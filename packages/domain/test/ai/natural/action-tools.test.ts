// The natural agent's actions (spec 3.3, 3.4; G2, G6, G7): each checked against the data, then staged, or refused with
// a sentence that names the way on. Pure: the trips are literal sheets and the quote is a fake.
import { naturalFacts, type BookingTerms, type LiveOffer, type NaturalFacts } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { stageAction, withStaged, type ActionContext } from "../../../src/ai/natural/tools/action-tools.js";
import type {
  NaturalChatLine,
  NaturalLeadView,
  QuoteFigures,
  StagedSet,
  TripSheet,
} from "../../../src/ai/natural/types.js";
import { instantAt, parseCalendarDate, parseTimeOfDay } from "../../../src/kernel/index.js";

const zone = "Asia/Kolkata";
// Sat 14 Nov 2026, 11:43 pm in Kolkata.
const now = new Date("2026-11-14T18:13:00Z");
const today = parseCalendarDate("2026-11-14");
const MINUTE = 60_000;
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);
const hoursAgo = (hours: number) => minutesAgo(hours * 60);

function sheet(number: number, title: string, place: string, fileIds: string[]): TripSheet {
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
const kedarkantha = sheet(1, "Kedarkantha Trek", "Sankri, Uttarakhand", [
  "brochure-1",
  "photo-1",
  "photo-2",
  "photo-3",
]);
const brahmatal = sheet(2, "Brahmatal Trek", "Lohajung", ["brochure-2"]);

let lineCount = 0;
function line(from: NaturalChatLine["from"], text: string, minutes: number): NaturalChatLine {
  lineCount += 1;
  return { id: `line-${String(lineCount)}`, from, at: minutesAgo(minutes), kind: "text", text };
}

const facts = (over: Partial<NaturalFacts> = {}): NaturalFacts => ({
  ...naturalFacts.parse({ agent: "natural" }),
  ...over,
});
const lead: NaturalLeadView = {
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

const perPerson: Partial<Record<string, number>> = { double: 1_299_900, triple: 949_900 };
/** The fake quote: ₹12,999 double and ₹9,499 triple per person, ₹3,000 advance each; no room asked is triple. */
function quoteOf(terms: BookingTerms): Promise<QuoteFigures> {
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

const firstLine = line("customer", "Hi, December mein koi trek hai?", 1);
function ctx(over: Partial<ActionContext> = {}): ActionContext {
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
function saying(said: string, earlier: NaturalChatLine[] = []): Partial<ActionContext> {
  const answer = line("customer", said, 1);
  return { lines: [...earlier, answer], newLines: [answer], lastInboundAt: answer.at };
}

/** The arguments of an offer for T1 on Sat 19 Dec. */
const terms = (over: Record<string, unknown> = {}) => ({ trip_id: "T1", date: "2026-12-19", adults: 2, ...over });

/** T1 on Sat 19 Dec for 2 adults in a double, as a total told keeps it (pay-in-full changes no total). */
const toldTerms = { packageId: "package-1", startsOn: "2026-12-19", adults: 2, room: "double" as const };
const offerTerms: BookingTerms = { ...toldTerms, childrenAges: [], payInFull: false };
const offerAt = minutesAgo(30);
const offer: LiveOffer = {
  ...offerTerms,
  departureId: "departure-2026-12-19",
  totalPaise: 2_599_800,
  advancePaise: 600_000,
  at: offerAt.toISOString(),
};
const ourOffer = () =>
  line("you", "Sat 19 Dec, 2 log, double: total ₹25,998, advance ₹6,000. Full name bata dijiye?", 30);

/** A chat where the last turn made `made` and the customer then wrote `said`. */
function afterOffer(said: string, options: { made?: LiveOffer; before?: NaturalChatLine[] } = {}) {
  const made = options.made ?? offer;
  const asked = line("customer", "19 Dec, 2 log, double room", 32);
  return {
    facts: facts({ offer: made, lastTurnAt: made.at }),
    ...saying(said, [...(options.before ?? []), asked, ourOffer()]),
  };
}

const yes = { ...terms({ room: "double" }), full_name: "Rohan Mehta", customer_words: "haan, Rohan Mehta" };

describe("stageAction", () => {
  it("refuses a date already past in the agency's day, at 11:43 pm in Kolkata", async () => {
    // Sat 14 Nov is still today at 11:43 pm in Kolkata; Fri 13 Nov is past.
    expect(await stageAction(ctx(), "update_lead", { date: "2026-11-13" }, "")).toEqual({
      refused: "refused: Fri 13 Nov is past (today is Sat 14 Nov); ask which date they mean",
    });
    expect(await stageAction(ctx(), "update_lead", { date: "2026-11-14" }, "")).toMatchObject({
      staged: { tool: "update_lead", fields: { day: "2026-11-14" }, notes: [] },
    });
    expect(await stageAction(ctx(), "update_lead", { month: "2026-10" }, "")).toEqual({
      refused: "refused: October is past (today is Sat 14 Nov); ask which month they mean",
    });
    expect(await stageAction(ctx(), "update_lead", { month: "2026-11" }, "")).toMatchObject({
      staged: { fields: { month: "2026-11" } },
    });
    // This evening's 6 pm has gone by in Kolkata (the 00:30 case in follow-up-time.test.ts tells IST from UTC).
    expect(await stageAction(ctx(), "plan_follow_up", { when: "this_evening", about: "Dates" }, "")).toEqual({
      refused: "refused: it's past 6 pm already; use tomorrow_morning",
    });
    expect(
      await stageAction(ctx(), "plan_follow_up", { when: "on_date", date: "2026-11-14", about: "Dates" }, ""),
    ).toEqual({ refused: "refused: on_date needs a day after today (Sat 14 Nov); for sooner, use in_a_few_hours" });
    // Tomorrow morning is Sunday's 10 am in Kolkata, not 10 am UTC.
    expect(await stageAction(ctx(), "plan_follow_up", { when: "tomorrow_morning", about: "Dates" }, "")).toEqual({
      staged: { tool: "plan_follow_up", at: new Date("2026-11-15T04:30:00Z"), about: "Dates" },
      result: "follow-up planned for Sun 15 Nov, 10 am",
    });
  });

  it("keeps a person's value: a different one becomes a note", async () => {
    const outcome = await stageAction(ctx({ typed: { adults: 3 } }), "update_lead", { adults: 2 }, "");
    expect(outcome).toMatchObject({
      staged: { tool: "update_lead", fields: {}, notes: ["Customer now says 2 adults; the lead says 3."] },
    });
    expect(outcome).toEqual({
      staged: { tool: "update_lead", fields: {}, notes: ["Customer now says 2 adults; the lead says 3."] },
      result:
        "nothing saved; a person's value stands, noted for the team: Customer now says 2 adults; the lead says 3.",
    });
  });

  it("saves what no person set, and leaves a person's same value or a day inside their month alone", async () => {
    const typed = {
      adults: 2,
      children_ages: [10, 8],
      when: { kind: "month", month: "2026-12" },
      departure_city: "Delhi",
      room_type: "triple",
    };
    const said = {
      trip_id: "T1",
      date: "2026-12-19",
      adults: 2,
      children_ages: [8, 10],
      pickup_city: "delhi",
      room: "double",
      name: "Rohan Mehta",
    };
    expect(await stageAction(ctx({ typed }), "update_lead", said, "")).toEqual({
      staged: {
        tool: "update_lead",
        fields: { packageId: "package-1", name: "Rohan Mehta" },
        notes: ["Customer now says double room; the lead says triple."],
      },
      result:
        "saved: trip T1, name Rohan Mehta; a person's value stands, noted for the team: " +
        "Customer now says double room; the lead says triple.",
    });
    expect(await stageAction(ctx(), "update_lead", said, "")).toEqual({
      staged: {
        tool: "update_lead",
        fields: {
          packageId: "package-1",
          day: "2026-12-19",
          adults: 2,
          childrenAges: [8, 10],
          pickupCity: "delhi",
          room: "double",
          name: "Rohan Mehta",
        },
        notes: [],
      },
      result: "saved: trip T1, Sat 19 Dec, 2 adults, 2 children (8, 10), pickup delhi, double room, name Rohan Mehta",
    });
    // A person's "flexible" is no date to keep, and a day they typed differs from a month the customer says now.
    expect(
      await stageAction(ctx({ typed: { when: { kind: "flexible" } } }), "update_lead", { month: "2026-12" }, ""),
    ).toMatchObject({ staged: { fields: { month: "2026-12" }, notes: [] } });
    expect(
      await stageAction(
        ctx({ typed: { when: { kind: "dates", from: "2026-12-19", to: "2026-12-24" } } }),
        "update_lead",
        { month: "2027-01" },
        "",
      ),
    ).toMatchObject({ staged: { fields: {}, notes: ["Customer now says January 2027; the lead says Sat 19 Dec."] } });
  });

  it("keeps a trip and a name a person set: another one becomes a note", async () => {
    // A person set the lead's place (Kedarkantha's, Sankri) and the customer's name.
    const typed = { destination: { kind: "existing", destinationId: "destination-1" }, name: "Rohan Mehta" };
    const trip = "Customer now says Brahmatal Trek; the lead says Sankri, Uttarakhand.";
    const name = "Customer now says name Ravi Kumar; the lead says Rohan Mehta.";
    expect(await stageAction(ctx({ typed }), "update_lead", { trip_id: "T2", name: "Ravi Kumar" }, "")).toEqual({
      staged: { tool: "update_lead", fields: {}, notes: [trip, name] },
      result: `nothing saved; a person's value stands, noted for the team: ${trip} ${name}`,
    });
    // A trip at their place fills the trip they left empty; their name again changes nothing.
    expect(await stageAction(ctx({ typed }), "update_lead", { trip_id: "T1", name: "rohan mehta" }, "")).toEqual({
      staged: { tool: "update_lead", fields: { packageId: "package-1" }, notes: [] },
      result: "saved: trip T1",
    });
    // The lead's trip again changes nothing; another trip there is theirs to choose, so it is a note.
    const tripOne = { ...lead, packageId: "package-1" };
    expect(await stageAction(ctx({ typed, lead: tripOne }), "update_lead", { trip_id: "T1" }, "")).toEqual({
      staged: { tool: "update_lead", fields: {}, notes: [] },
      result: "the lead says that already",
    });
    const twoThere = ctx({
      typed,
      lead: tripOne,
      sheets: [kedarkantha, { ...brahmatal, destinationId: "destination-1" }],
    });
    expect(await stageAction(twoThere, "update_lead", { trip_id: "T2" }, "")).toMatchObject({
      staged: { fields: {}, notes: ["Customer now says Brahmatal Trek; the lead says Kedarkantha Trek."] },
    });
    // A place no trip on sale goes to is still theirs.
    const elsewhere = { destination: { kind: "existing", destinationId: "destination-9" } };
    expect(await stageAction(ctx({ typed: elsewhere }), "update_lead", { trip_id: "T1" }, "")).toMatchObject({
      staged: { fields: {}, notes: ["Customer now says Kedarkantha Trek; the lead says another place."] },
    });
  });

  it("refuses a brochure for a trip the chat hasn't named (G6)", async () => {
    expect(await stageAction(ctx(), "send_brochure", { trip_id: "T2" }, "")).toEqual({
      refused: "refused: the chat hasn't named T2 Brahmatal Trek: name it, or ask which trip",
    });
  });

  it("never takes a word like of, in, ka or mein for a trip's name: asked about Meghalaya, no Spiti PDF (G6)", async () => {
    const sheets = [
      sheet(1, "Spiti Valley in Winter", "Kaza, Himachal Pradesh", ["brochure-1"]),
      sheet(2, "Valley of Flowers", "Ghangaria, Uttarakhand", ["brochure-2"]),
      sheet(3, "Meghalaya Living Roots", "Shillong, Meghalaya", ["brochure-3"]),
    ];
    const labels = new Map(sheets.map((one) => [one.label, one.packageId]));
    const brochures = async (said: string, words: string) => {
      const context = ctx({ sheets, labels, ...saying(said) });
      const sent = await Promise.all(
        sheets.map((one) => stageAction(context, "send_brochure", { trip_id: one.label }, words)),
      );
      return sent.map((outcome) => ("staged" in outcome ? "sent" : outcome.refused));
    };
    const notNamed = (trip: string) => `refused: the chat hasn't named ${trip}: name it, or ask which trip`;
    const onlyMeghalaya = [notNamed("T1 Spiti Valley in Winter"), notNamed("T2 Valley of Flowers"), "sent"];
    expect(
      await brochures("Meghalaya trip in December?", "Here are the details of the Meghalaya trip in December"),
    ).toEqual(onlyMeghalaya);
    expect(await brochures("Meghalaya ka trip December mein", "")).toEqual(onlyMeghalaya);
    // The trips matching the most words count: "Valley of Flowers" names it, not Spiti Valley; and a trip this reply
    // names counts beside it.
    expect(await brochures("Valley of Flowers ya Meghalaya?", "")).toEqual([
      notNamed("T1 Spiti Valley in Winter"),
      "sent",
      notNamed("T3 Meghalaya Living Roots"),
    ]);
    expect(await brochures("Valley of Flowers ya Meghalaya?", "Meghalaya ka brochure bhej rahi hoon")).toEqual([
      notNamed("T1 Spiti Valley in Winter"),
      "sent",
      "sent",
    ]);
  });

  it("sends the brochure of the lead's trip, the ad's, one quoted this turn, or one named in the new lines or these words", async () => {
    const sent = { staged: { tool: "send_brochure", packageId: "package-2", fileIds: ["brochure-2"] } };
    const quoted = await quoteOf({ ...offerTerms, packageId: "package-2" });
    const named = [
      ctx({ lead: { ...lead, packageId: "package-2" } }),
      ctx({ adPackageId: "package-2" }),
      ctx({ quotedThisTurn: [quoted] }),
      ctx(saying("Brahmatal ka brochure bhejo")),
      ctx(saying("Lohajung wala trek kaisa hai?")),
    ];
    for (const context of named)
      expect(await stageAction(context, "send_brochure", { trip_id: "T2" }, "")).toMatchObject(sent);
    expect(await stageAction(ctx(), "send_brochure", { trip_id: "T2" }, "Here is the Brahmatal brochure.")).toEqual({
      ...sent,
      result: "goes with your reply: T2 Brahmatal Trek's brochure and photos, 1 file",
    });
    // "Trek" names a kind of trip, never one trip.
    expect(await stageAction(ctx(saying("Trek ka brochure bhejo")), "send_brochure", { trip_id: "T2" }, "")).toEqual({
      refused: "refused: the chat hasn't named T2 Brahmatal Trek: name it, or ask which trip",
    });
  });

  it("refuses a brochure sent before in this chat, and one with no files; sends at most 3 files", async () => {
    const aboutT1 = { lead: { ...lead, packageId: "package-1" } };
    expect(
      await stageAction(
        ctx({ ...aboutT1, facts: facts({ sentTripIds: ["package-1"] }) }),
        "send_brochure",
        { trip_id: "T1" },
        "",
      ),
    ).toEqual({
      refused:
        "refused: T1 Kedarkantha Trek's brochure went in this chat already; point them to it, or answer in words",
    });
    const bare = sheet(2, "Brahmatal Trek", "Lohajung", []);
    expect(
      await stageAction(
        ctx({ ...saying("Brahmatal?"), sheets: [kedarkantha, bare] }),
        "send_brochure",
        { trip_id: "T2" },
        "",
      ),
    ).toEqual({ refused: "refused: T2 Brahmatal Trek has no brochure or photos; describe it in words" });
    expect(await stageAction(ctx(aboutT1), "send_brochure", { trip_id: "T1" }, "")).toEqual({
      staged: { tool: "send_brochure", packageId: "package-1", fileIds: ["brochure-1", "photo-1", "photo-2"] },
      result: "goes with your reply: T1 Kedarkantha Trek's brochure and photos, 3 files",
    });
  });

  it("refuses a trip outside the turn's labels, as the schema's problem", async () => {
    expect(await stageAction(ctx(), "send_brochure", { trip_id: "T9" }, "")).toEqual({
      refused: "refused: T9 isn't one of the trips; the trips are T1, T2",
    });
  });

  it("refuses an offer for more than 10 people, naming the hand-over", async () => {
    expect(await stageAction(ctx(), "offer_booking", terms({ adults: 11 }), "")).toEqual({
      refused: "refused: 11 people is more than 10; hand_over(big_group) with the group's details",
    });
    expect(await stageAction(ctx(), "offer_booking", terms({ adults: 8, children_ages: [10, 12, 14] }), "")).toEqual({
      refused: "refused: 11 people is more than 10; hand_over(big_group) with the group's details",
    });
  });

  it("refuses an offer without payment details, or with a booking ahead or awaiting payment", async () => {
    expect(await stageAction(ctx({ paymentReady: false }), "offer_booking", terms(), "")).toEqual({
      refused:
        "refused: the agency's payment details aren't set, so this chat can't take a booking; " +
        "create_task(question) for the team with the booking's details",
    });
    expect(
      await stageAction(ctx({ booking: { id: null, awaitingPayment: false } }), "offer_booking", terms(), ""),
    ).toEqual({
      refused:
        "refused: they have a booking ahead; changing it or a second one is the team's: hand_over(existing_booking)",
    });
    expect(
      await stageAction(ctx({ booking: { id: "booking-1", awaitingPayment: true } }), "offer_booking", terms(), ""),
    ).toEqual({
      refused: "refused: their booking is waiting for payment; resend_payment sends the payment message again",
    });
  });

  it("passes the quote's refusal on", async () => {
    const full = "refused: 1 left on Sat 19 Dec and the party is 2; open with seats: Sat 26 Dec";
    expect(
      await stageAction(ctx({ quoteOf: () => Promise.resolve({ refused: full }) }), "offer_booking", terms(), ""),
    ).toEqual({
      refused: full,
    });
  });

  it("stages an offer with its total and advance, and returns them", async () => {
    const outcome = await stageAction(ctx(), "offer_booking", terms({ adults: 2, room: "double" }), "");
    expect(outcome).toMatchObject({ staged: { tool: "offer_booking", offer: { totalPaise: 2_599_800 } } });
    expect("result" in outcome && outcome.result).toContain("total ₹25,998");
    expect(outcome).toEqual({
      staged: {
        tool: "offer_booking",
        offer: { ...offer, at: now.toISOString() },
        figures: expect.objectContaining({ totalPaise: 2_599_800, advancePaise: 600_000 }) as unknown,
      },
      result:
        "offered: T1 Kedarkantha Trek, Sat 19 Dec, 2 adults, double; total ₹25,998; advance ₹6,000 (₹3,000 per " +
        "person). Your words state the date and the advance, and ask for their full name or a yes",
    });
    // Paying in full, the words state the total.
    expect(await stageAction(ctx(), "offer_booking", terms({ room: "double", pay_in_full: true }), "")).toMatchObject({
      result:
        "offered: T1 Kedarkantha Trek, Sat 19 Dec, 2 adults, double, paying in full; total ₹25,998, all due now. " +
        "Your words state the date and the total, and ask for their full name or a yes",
    });
  });

  it("refuses book with no live offer and no total told: make the offer first", async () => {
    const first = {
      refused:
        "refused: there is no live offer or total told for these terms; make the offer first with offer_booking, " +
        "and book after their yes",
    };
    expect(await stageAction(ctx(saying("haan, Rohan Mehta")), "book", yes, "")).toEqual(first);
    // Made in an earlier turn: our latest message isn't the offer.
    const earlier = afterOffer("haan, Rohan Mehta");
    const later = minutesAgo(10);
    const sinceOffer = { ...earlier, facts: facts({ offer, lastTurnAt: later.toISOString() }) };
    expect(await stageAction(ctx(sinceOffer), "book", yes, "")).toEqual(first);
    // A person wrote after the offer.
    const answer = line("customer", "haan, Rohan Mehta", 1);
    const team = line("team", "26 Dec bhi ho sakta hai", 5);
    const lines = [line("customer", "19 Dec, 2 log", 32), ourOffer(), team, answer];
    expect(await stageAction(ctx({ ...afterOffer(""), lines, newLines: [answer] }), "book", yes, "")).toEqual(first);
  });

  it("refuses book on terms that differ from the live offer", async () => {
    expect(await stageAction(ctx(afterOffer("haan, Rohan Mehta")), "book", { ...yes, room: "triple" }, "")).toEqual({
      refused:
        "refused: these terms differ from the live offer (T1 Kedarkantha Trek, Sat 19 Dec, 2 adults, double, total " +
        "₹25,998); book on its terms, or offer these terms first with offer_booking",
    });
    expect(
      await stageAction(ctx(afterOffer("haan, Rohan Mehta")), "book", { ...yes, pay_in_full: true }, ""),
    ).toMatchObject({
      refused: expect.stringContaining("differ from the live offer") as unknown,
    });
  });

  it("books only the live offer's terms while it stands, whatever total was told before", async () => {
    // The offer stands for 2 on Sat 12 Dec; 3 on Sat 19 Dec were told a total five hours ago.
    const standing = { ...offer, startsOn: "2026-12-12", departureId: "departure-2026-12-12" };
    const toldThree = {
      ...toldTerms,
      adults: 3,
      childrenAges: [],
      totalPaise: 3_899_700,
      at: hoursAgo(5).toISOString(),
    };
    const context = ctx({
      ...afterOffer("haan, Rohan Mehta", { made: standing }),
      facts: facts({ offer: standing, lastTurnAt: standing.at, told: [toldThree] }),
    });
    expect(await stageAction(context, "book", { ...yes, adults: 3 }, "")).toEqual({
      refused:
        "refused: these terms differ from the live offer (T1 Kedarkantha Trek, Sat 12 Dec, 2 adults, double, total " +
        "₹25,998); book on its terms, or offer these terms first with offer_booking",
    });
    expect(await stageAction(context, "book", { ...yes, date: "2026-12-12" }, "")).toMatchObject({
      staged: { tool: "book", via: "offer", terms: { startsOn: "2026-12-12", adults: 2 } },
    });
  });

  it("refuses book when the customer's words aren't in a new line after the offer", async () => {
    const before = [line("customer", "haan, Rohan Mehta", 40)];
    expect(await stageAction(ctx(afterOffer("sochte hain", { before })), "book", yes, "")).toEqual({
      refused:
        "refused: customer_words must be their own words, copied from a message they sent after the offer; if they " +
        "haven't said yes, ask",
    });
  });

  it("refuses book with a full name found nowhere in the chat, the lead or the profile", async () => {
    const context = ctx({ ...afterOffer("haan"), lead: { ...lead, name: "Rohan" }, profileName: "RM" });
    expect(await stageAction(context, "book", { ...yes, customer_words: "haan" }, "")).toEqual({
      refused:
        'refused: "Rohan Mehta" isn\'t in the chat, on the lead or on their WhatsApp profile; ask for their full ' +
        "name as on their ID",
    });
  });

  it("refuses book when seats no longer cover the party, naming open dates", async () => {
    const full = "refused: 1 left on Sat 19 Dec and the party is 2; open with seats: Sat 26 Dec";
    const context = ctx({ ...afterOffer("haan, Rohan Mehta"), quoteOf: () => Promise.resolve({ refused: full }) });
    expect(await stageAction(context, "book", yes, "")).toEqual({ refused: full });
  });

  it("refuses book when the total changed since the offer", async () => {
    const dearer = async (asked: BookingTerms) => ({ ...(await quoteOf(asked)), totalPaise: 2_699_800 });
    expect(await stageAction(ctx({ ...afterOffer("haan, Rohan Mehta"), quoteOf: dearer }), "book", yes, "")).toEqual({
      refused:
        "refused: the price changed since the offer: the total is now ₹26,998; make the offer again with offer_booking",
    });
  });

  it("books on the live offer's terms with the customer's own words", async () => {
    const outcome = await stageAction(ctx(afterOffer("Haan,  Rohan Mehta!")), "book", yes, "");
    expect(outcome).toEqual({
      staged: {
        tool: "book",
        terms: offerTerms,
        figures: await quoteOf(offerTerms),
        fullName: "Rohan Mehta",
        customerWords: "haan, Rohan Mehta",
        via: "offer",
      },
      result:
        "held once your reply goes: T1 Kedarkantha Trek, Sat 19 Dec, 2 adults, double; total ₹25,998; advance " +
        "₹6,000 due now. The app then sends the payment message and QR: leave payment details out of your words",
    });
    // The name may be the lead's or their WhatsApp profile's; a trek that sells one room books it whatever was asked.
    const triple = { ...offer, room: "triple" as const, totalPaise: 1_899_800 };
    const byProfile = ctx({ ...afterOffer("haan", { made: triple }), profileName: "rohan mehta" });
    const noRoom = { ...terms(), full_name: "Rohan Mehta", customer_words: "haan" };
    expect(await stageAction(byProfile, "book", noRoom, "")).toMatchObject({ staged: { tool: "book", via: "offer" } });
    const byLead = ctx({ ...afterOffer("haan"), lead: { ...lead, name: "Rohan Mehta" } });
    expect(await stageAction(byLead, "book", { ...yes, customer_words: "haan" }, "")).toMatchObject({
      staged: { tool: "book" },
    });
  });

  it("books at once on a total told for exactly these terms in the last 24 hours, with no booking word", async () => {
    const toldAt = hoursAgo(5);
    const told = { ...toldTerms, childrenAges: [], totalPaise: 2_599_800, at: toldAt.toISOString() };
    const context = ctx({
      facts: facts({ told: [told], lastTurnAt: toldAt.toISOString() }),
      ...saying("theek hai, Rohan Mehta", [
        line("customer", "19 Dec, 2 log, double ka kitna?", 5 * 60 + 2),
        line("you", "Dono ka total ₹25,998.", 5 * 60),
      ]),
    });
    expect(await stageAction(context, "book", { ...yes, customer_words: "theek hai" }, "")).toMatchObject({
      staged: { tool: "book", via: "told", customerWords: "theek hai" },
    });
    // Paying in full changes no total.
    expect(
      await stageAction(context, "book", { ...yes, customer_words: "theek hai", pay_in_full: true }, ""),
    ).toMatchObject({ staged: { tool: "book", via: "told", terms: { payInFull: true } } });
  });

  it("doesn't take the told shortcut after 24 hours, or for other terms", async () => {
    const first = {
      refused:
        "refused: there is no live offer or total told for these terms; make the offer first with offer_booking, " +
        "and book after their yes",
    };
    const toldOn = (at: Date, over: Partial<NaturalFacts["told"][number]> = {}) => {
      const told = { ...toldTerms, childrenAges: [], totalPaise: 2_599_800, ...over, at: at.toISOString() };
      return ctx({ facts: facts({ told: [told], lastTurnAt: at.toISOString() }), ...saying("theek hai, Rohan Mehta") });
    };
    expect(await stageAction(toldOn(hoursAgo(25)), "book", yes, "")).toEqual(first);
    expect(await stageAction(toldOn(hoursAgo(5), { adults: 3 }), "book", yes, "")).toEqual(first);
    expect(await stageAction(toldOn(hoursAgo(5), { childrenAges: [8] }), "book", yes, "")).toEqual(first);
  });

  it("refuses resend_payment without an AI booking awaiting payment", async () => {
    const none = {
      refused: "refused: no booking from this chat is waiting for payment; to book, offer_booking first",
    };
    expect(await stageAction(ctx(), "resend_payment", {}, "")).toEqual(none);
    expect(await stageAction(ctx({ booking: { id: null, awaitingPayment: true } }), "resend_payment", {}, "")).toEqual(
      none,
    );
    expect(
      await stageAction(ctx({ booking: { id: "booking-1", awaitingPayment: false } }), "resend_payment", {}, ""),
    ).toEqual(none);
    expect(
      await stageAction(ctx({ booking: { id: "booking-1", awaitingPayment: true } }), "resend_payment", {}, ""),
    ).toEqual({
      staged: { tool: "resend_payment" },
      result: "the app sends the payment message and QR again after your reply",
    });
  });

  it("stages a task at the agency's time and a note; refuses a call-back on no real day or in the past", async () => {
    expect(
      await stageAction(
        ctx(),
        "create_task",
        { kind: "call_back", text: "Call about 26 Dec", call_at: "2026-11-15T18:30" },
        "",
      ),
    ).toEqual({
      staged: {
        tool: "create_task",
        kind: "call_back",
        text: "Call about 26 Dec",
        callAt: instantAt(parseCalendarDate("2026-11-15"), parseTimeOfDay("18:30"), zone),
      },
      result: "call-back task for the team at Sun 15 Nov, 6:30 pm",
    });
    expect(await stageAction(ctx(), "create_task", { kind: "question", text: "Is there a Jan batch?" }, "")).toEqual({
      staged: { tool: "create_task", kind: "question", text: "Is there a Jan batch?", callAt: null },
      result: "question task for the team",
    });
    expect(
      await stageAction(ctx(), "create_task", { kind: "call_back", text: "Call", call_at: "2027-02-31T10:00" }, ""),
    ).toEqual({
      refused: "refused: call_at 2027-02-31T10:00 isn't a real day and time; give one like 2026-12-13T18:30",
    });
    expect(
      await stageAction(ctx(), "create_task", { kind: "call_back", text: "Call", call_at: "2026-11-14T23:00" }, ""),
    ).toEqual({ refused: "refused: call_at Sat 14 Nov, 11 pm is past; give a later time" });
    expect(await stageAction(ctx(), "add_note", { text: "Prefers weekends" }, "")).toEqual({
      staged: { tool: "add_note", text: "Prefers weekends" },
      result: "note added for the team",
    });
  });

  it("stages hand_over, suggest_close and stay_quiet always", async () => {
    const busy = ctx({ paymentReady: false, booking: { id: "booking-1", awaitingPayment: true } });
    expect(await stageAction(busy, "hand_over", { reason: "big_group", summary: "14 people, 26 Dec" }, "")).toEqual({
      staged: { tool: "hand_over", reason: "big_group", summary: "14 people, 26 Dec" },
      result: "handed to a person after your reply; tell them someone will reply here, with no promised time",
    });
    expect(await stageAction(busy, "suggest_close", { kind: "not_a_lead", reason: "A supplier" }, "")).toEqual({
      staged: { tool: "suggest_close", kind: "not_a_lead", reason: "A supplier" },
      result: "suggested: not a lead; a person decides",
    });
    expect(await stageAction(busy, "stay_quiet", { reason: "They said ok" }, "")).toEqual({
      staged: { tool: "stay_quiet", reason: "They said ok" },
      result: "no message goes",
    });
  });

  it("a later call of the same tool replaces the earlier one", async () => {
    let staged: StagedSet = new Map();
    for (const text of ["Prefers weekends", "Going with a friend"]) {
      const outcome = await stageAction(ctx(), "add_note", { text }, "");
      if ("staged" in outcome) staged = withStaged(staged, outcome.staged);
    }
    staged = withStaged(staged, { tool: "stay_quiet", reason: "Done" });
    expect([...staged.values()]).toEqual([
      { tool: "add_note", text: "Going with a friend" },
      { tool: "stay_quiet", reason: "Done" },
    ]);
  });
});
