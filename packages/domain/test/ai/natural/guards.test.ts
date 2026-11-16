// The natural agent's guards on its words (spec 5, rulings 2–5): amounts, an offer, claims, the team's word and payment
// details are each checked against the agency's data (bench agency T, as literal sheets); a number alone is never refused.
import type { AgencyAnswers, LiveOffer, ToldTotal } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { checkWords, traceFlags, type GuardContext } from "../../../src/ai/natural/guards/check-words.js";
import { groundedAmounts, tripTextOf } from "../../../src/ai/natural/guards/grounded.js";
import type { QuoteFigures, TripSheet } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const now = new Date("2026-11-15T06:30:00Z");
const today = parseCalendarDate("2026-11-15");
const day = parseCalendarDate;
const DAY_MS = 86_400_000;

const bySeason = (price: number) => ({ priceFrom: "season", perPersonPaise: { triple: price } }) as const;

const kedarkantha: TripSheet = {
  label: "T1",
  packageId: "kedarkantha",
  title: "Kedarkantha Trek",
  place: "Sankri, Uttarakhand",
  destinationId: null,
  nights: 5,
  startCity: "Dehradun",
  summary: "Kedarkantha Trek: a winter trek with snow camps.",
  highlights: ["Summit sunrise", "Snow camps"],
  days: [
    { title: "Dehradun to Sankri", text: "Drive 220 km, 8 to 9 hours." },
    { title: "Kedarkantha summit (3,800 m) and back", text: "Start at 3 am for the sunrise." },
  ],
  pickups: ["Dehradun ISBT, 6:30 am"],
  inclusions: "Tents, meals on the trek and a certified trek leader.",
  exclusions: "Personal gear.",
  notes: "Carry warm layers.",
  cancellation: "50% back up to 15 days before.",
  rooms: ["triple"],
  seasons: [{ name: "Winter", from: day("2026-11-01"), until: day("2026-12-31"), perPersonPaise: { triple: 949_900 } }],
  pricesIncludeGst: true,
  taxRateBasisPoints: 500,
  fromPaise: 949_900,
  advancePerPersonPaise: 300_000,
  departures: ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"].map((startsOn) => ({
    id: `kk-${startsOn}`,
    startsOn: day(startsOn),
    freeSeats: 20,
    ...bySeason(949_900),
  })),
  fileIds: ["brochure"],
};
const brahmatal: TripSheet = {
  ...kedarkantha,
  label: "T2",
  packageId: "brahmatal",
  title: "Brahmatal Trek",
  place: "Lohajung, Uttarakhand",
  startCity: "Kathgodam",
  seasons: [
    { name: "Winter", from: day("2026-11-01"), until: day("2026-12-31"), perPersonPaise: { triple: 1_049_900 } },
  ],
  fromPaise: 1_049_900,
  departures: ["2026-12-12", "2026-12-26"].map((startsOn) => ({
    id: `bt-${startsOn}`,
    startsOn: day(startsOn),
    freeSeats: 20,
    ...bySeason(1_049_900),
  })),
  fileIds: [],
};
/** Kedarkantha at one price that excludes 5% GST. */
const excludingGst = (price: number): TripSheet => ({
  ...kedarkantha,
  pricesIncludeGst: false,
  seasons: [{ name: "Winter", from: day("2026-11-01"), until: day("2026-12-31"), perPersonPaise: { triple: price } }],
  fromPaise: price,
  departures: kedarkantha.departures.map((one) => ({ ...one, ...bySeason(price) })),
});
const answers: AgencyAnswers = {
  safety: "A certified trek leader, oxygen on every trek, and separate tents for women.",
  children: "10 and above, with a parent.",
  cancellation: "50% back up to 15 days before; nothing after.",
  refunds: "Refunds reach you in 7 working days.",
  id_documents: "Carry one government photo ID.",
  payment_methods: "UPI or bank transfer.",
};

/** Sat 12 Dec on Kedarkantha, 3 adults in a triple tent: ₹28,497 in all, ₹9,000 advance (₹3,000 each). */
const offer: LiveOffer = {
  packageId: "kedarkantha",
  startsOn: "2026-12-12",
  adults: 3,
  childrenAges: [],
  room: "triple",
  payInFull: false,
  departureId: "kk-2026-12-12",
  totalPaise: 2_849_700,
  advancePaise: 900_000,
  at: now.toISOString(),
};

interface Setup {
  sheets?: readonly TripSheet[];
  answers?: AgencyAnswers;
  teamLines?: readonly string[];
  told?: readonly ToldTotal[];
  quoted?: readonly QuoteFigures[];
  customerText?: string;
  offer?: LiveOffer | null;
  /** The live offer an earlier turn made, which the turn block shows. */
  liveOffer?: LiveOffer | null;
  paymentConfirmed?: boolean;
  bookingConfirmed?: boolean;
  ownerText?: string;
}

function contextOf(setup: Setup = {}): GuardContext {
  const teamLines = setup.teamLines ?? [];
  const sheets = setup.sheets ?? [kedarkantha, brahmatal];
  const owner = setup.answers ?? answers;
  const grounded = groundedAmounts({
    sheets,
    today,
    answers: owner,
    teamLines,
    told: setup.told ?? [],
    quoted: setup.quoted ?? [],
    liveOffer: setup.liveOffer ?? null,
    now,
  });
  return {
    grounded,
    customerText: setup.customerText ?? "",
    offer: setup.offer ?? null,
    paymentConfirmed: setup.paymentConfirmed ?? false,
    bookingConfirmed: setup.bookingConfirmed ?? false,
    teamText: teamLines.join("\n"),
    ownerText: setup.ownerText ?? [...Object.values(owner), ...sheets.map(tripTextOf)].join("\n"),
    today,
  };
}
const check = (words: string, setup: Setup = {}) => checkWords(words, contextOf(setup));
const refusedBy = (guard: string) => ({ ok: false, guard });

describe("G1: every amount in the words is one the data holds", () => {
  it("lets a typed price that matches the price table go out", () => {
    expect(check("₹9,499 per person, triple sharing.")).toMatchObject({ ok: true });
  });

  it("refuses an amount found nowhere, with the spec's retry", () => {
    expect(check("Special price ₹7,999 for you.")).toMatchObject({
      ok: false,
      guard: "G1",
      fallback: "fallback_task",
      retry: "₹7,999 isn't in the agency's prices. Use a price from the trips, call quote, or leave the amount out.",
    });
  });

  it("passes a table price times 2 to 10", () => {
    expect(check("₹9,499 × 3 = ₹28,497")).toMatchObject({ ok: true });
    expect(check("10 log: ₹94,990, advance ₹30,000")).toMatchObject({ ok: true });
    expect(check("11 log: ₹1,04,489")).toMatchObject(refusedBy("G1"));
  });

  it("passes shorthand within 1% and refuses it past", () => {
    expect(check("around 9.5k per person")).toMatchObject({ ok: true });
    // Pre-flight #4: 12k is 4 × the ₹3,000 advance, so grounded; 13k is within 1% of a balance for two
    // ((₹9,499 − ₹3,000) × 2 = ₹12,998, fix round 1), so the refusal uses 14k.
    expect(check("around 14k per person")).toMatchObject(refusedBy("G1"));
    expect(check("₹9,500 per person")).toMatchObject(refusedBy("G1"));
  });

  it("passes the GST-inclusive figure when prices exclude GST", () => {
    const tenThousand = excludingGst(1_000_000);
    expect(check("₹10,000 + 5% GST = ₹10,500 per person", { sheets: [tenThousand] })).toMatchObject({ ok: true });
    expect(check("₹10,500 per person", { sheets: [{ ...tenThousand, pricesIncludeGst: true }] })).toMatchObject(
      refusedBy("G1"),
    );
  });

  it("passes a departure's own price, and a season's only while it hasn't ended", () => {
    const premium: TripSheet = {
      ...kedarkantha,
      seasons: [
        ...kedarkantha.seasons,
        { name: "Autumn", from: day("2026-10-01"), until: day("2026-11-14"), perPersonPaise: { triple: 899_900 } },
      ],
      departures: [
        ...kedarkantha.departures,
        {
          id: "new-year",
          startsOn: day("2026-12-31"),
          freeSeats: 8,
          priceFrom: "departure",
          perPersonPaise: { triple: 1_299_900 },
        },
      ],
    };
    expect(check("New Year batch: ₹12,999 per person", { sheets: [premium] })).toMatchObject({ ok: true });
    expect(check("Autumn price ₹8,999 per person", { sheets: [premium] })).toMatchObject(refusedBy("G1"));
  });

  it("passes a figure quote returned this turn, and a total told 29 days ago, not 31", () => {
    const quoted: QuoteFigures = {
      terms: {
        packageId: "kedarkantha",
        startsOn: "2027-01-09",
        adults: 2,
        childrenAges: [],
        room: "triple",
        payInFull: false,
      },
      departureId: "january",
      perPersonPaise: 1_150_000,
      totalPaise: 2_300_000,
      advancePaise: 600_000,
      advancePerPersonPaise: 300_000,
      freeSeats: 12,
    };
    expect(check("9 Jan: ₹11,500 per person, ₹23,000 for both of you.", { quoted: [quoted] })).toMatchObject({
      ok: true,
    });
    // With a child's place the total isn't the adults' price times the party: ₹28,000 − ₹9,000 leaves ₹19,000.
    const withChild = {
      ...quoted,
      terms: { ...quoted.terms, childrenAges: [8] },
      totalPaise: 2_800_000,
      advancePaise: 900_000,
    };
    expect(check("₹9,000 now, balance ₹19,000 later.", { quoted: [withChild] })).toMatchObject({ ok: true });
    expect(check("₹9,000 now, balance ₹19,000 later.", { quoted: [quoted] })).toMatchObject(refusedBy("G1"));
    const withGst = { quoted: [quoted], sheets: [excludingGst(1_000_000)] };
    expect(check("9 Jan: ₹12,075 per person with GST.", withGst)).toMatchObject({ ok: true });
    const toldAt = (days: number): ToldTotal => ({
      packageId: "kedarkantha",
      startsOn: "2026-12-19",
      adults: 2,
      childrenAges: [5],
      room: "triple",
      totalPaise: 2_449_800,
      at: new Date(now.getTime() - days * DAY_MS).toISOString(),
    });
    expect(check("The total stays ₹24,498.", { told: [toldAt(29)] })).toMatchObject({ ok: true });
    expect(check("₹9,000 advance, balance ₹15,498.", { told: [toldAt(29)] })).toMatchObject({ ok: true });
    expect(check("The total stays ₹24,498.", { told: [toldAt(31)] })).toMatchObject(refusedBy("G1"));
  });

  it("passes the live offer's total, advance and balance, which the turn block shows", () => {
    // A child's place makes a total the adults' price times the party doesn't give: ₹24,498, less ₹9,000 is ₹15,498.
    const withChild: LiveOffer = { ...offer, adults: 2, childrenAges: [8], totalPaise: 2_449_800 };
    const words = "Total ₹24,498 hi hai: ₹9,000 advance abhi, balance ₹15,498 baad mein.";
    expect(check(words, { liveOffer: withChild })).toMatchObject({ ok: true });
    expect(check(words)).toMatchObject(refusedBy("G1"));
  });

  it("refuses the customer's own figure and says to refer to it without the amount", () => {
    expect(check("₹5,500 wala rate?", { customerText: "team said 5500" })).toMatchObject({
      ok: false,
      guard: "G1",
      retry: "₹5,500 is the customer's own figure: refer to it without the amount.",
    });
  });

  it("passes a figure the customer repeats when the data holds it (pre-flight #4)", () => {
    expect(check("Haan, ₹6,000 advance for both of you.", { customerText: "6000 advance na?" })).toMatchObject({
      ok: true,
    });
  });

  it("passes amounts from Team lines of the last 30 days", () => {
    expect(check("For your group it's ₹8,500 per person.", { teamLines: ["Inko 8500 me de do"] })).toMatchObject({
      ok: true,
    });
    expect(check("For your group it's ₹8,500 per person.")).toMatchObject(refusedBy("G1"));
  });

  it("passes amounts in the agency's answers and in trip text", () => {
    const withFee = { ...kedarkantha, notes: "Forest entry fee ₹750 per person, paid at Sankri." };
    expect(check("Entry fee ₹750 per person, paid at Sankri.", { sheets: [withFee] })).toMatchObject({ ok: true });
    const mules = { answers: { ...answers, safety: "A mule for your bags costs ₹600 a day." } };
    expect(check("A mule for bags is ₹600 a day.", mules)).toMatchObject({ ok: true });
    expect(check("A mule for bags is ₹600 a day.")).toMatchObject(refusedBy("G1"));
  });

  it("passes figures that follow from the data: the balance, the GST itself, a rupee either way (fix round 1)", () => {
    expect(check("Advance ₹9,000 now, balance ₹19,497 before the trip.")).toMatchObject({ ok: true });
    expect(check("₹4,998 + ₹250 GST = ₹5,248", { sheets: [excludingGst(499_800)] })).toMatchObject({ ok: true });
    // ₹10,250 × 3 = ₹30,750, and 5% GST makes ₹32,287.50: written ₹32,288 or ₹32,287.
    const tenTwoFifty = { sheets: [excludingGst(1_025_000)] };
    expect(check("3 log: ₹32,288", tenTwoFifty)).toMatchObject({ ok: true });
    expect(check("3 log: ₹32,287", tenTwoFifty)).toMatchObject({ ok: true });
    expect(check("3 log: ₹32,289", tenTwoFifty)).toMatchObject(refusedBy("G1"));
    expect(check("Advance ₹9,000 now, balance ₹19,500 before the trip.")).toMatchObject(refusedBy("G1"));
    // A price that includes GST shows no split: its share (₹999.90 for two on ₹10,499) grounds no round ₹1,000.
    expect(check("₹1,000 extra for the mule.")).toMatchObject(refusedBy("G1"));
    expect(check("₹4,000 extra for the mule.")).toMatchObject(refusedBy("G1"));
  });

  it("passes a discounted price only when owner or Team text gives that percent as a discount (fix round 1)", () => {
    const students = { answers: { ...answers, children: "10 and above. Students get 10% off." } };
    // ₹9,499 less 10% is ₹8,549.10.
    expect(check("Students: ₹8,549 after 10% off.", students)).toMatchObject({ ok: true });
    expect(check("Students pay ₹8,549.", { teamLines: ["Students ko 10% discount de do"] })).toMatchObject({
      ok: true,
    });
    expect(check("Students pay ₹8,549.")).toMatchObject(refusedBy("G1"));
    expect(check("Students pay ₹8,074.", students)).toMatchObject(refusedBy("G1"));
  });

  it("grounds no discounted price from a figure that owner text doesn't give as a discount (fix round 2)", () => {
    const answering = (cancellation: string) => ({ answers: { ...answers, cancellation } });
    // ₹9,499 less 50% is ₹4,749.50, less 30% is ₹6,649.30.
    expect(check("Special price ₹4,750.", answering("We offer a 50% refund up to 15 days before."))).toMatchObject(
      refusedBy("G1"),
    );
    expect(check("Special price ₹4,750.", answering("Call off 15 days before and get 50% back."))).toMatchObject(
      refusedBy("G1"),
    );
    expect(check("Special price ₹6,649.", answering("No discount on peak dates; 30% advance."))).toMatchObject(
      refusedBy("G1"),
    );
    // A negated discount grounds nothing (fix round 3).
    expect(check("Students pay ₹8,549.", { teamLines: ["Students ko 10% discount mat dena"] })).toMatchObject(
      refusedBy("G1"),
    );
    // A discount word in the sentence but not beside the figure gives nothing.
    const farOff = answering("Group discount available on request; 30% advance to book.");
    expect(check("Special price ₹6,649.", farOff)).toMatchObject(refusedBy("G1"));
    expect(check("Special price ₹4,750.", answering("Winter offer: 50% off on all treks."))).toMatchObject({
      ok: true,
    });
  });

  it("reads a bare amount of ₹500 or more, as Hinglish writes it (fix round 1)", () => {
    expect(check("Aapke liye 7,999 me ho jayega.")).toMatchObject({
      ok: false,
      guard: "G1",
      retry: "₹7,999 isn't in the agency's prices. Use a price from the trips, call quote, or leave the amount out.",
    });
    expect(check("Sirf 7999 lagenge.")).toMatchObject(refusedBy("G1"));
    const teamSaid = { teamLines: ["Inko 7,999 me de do"] };
    expect(check("Aapke liye 7,999 me ho jayega.", teamSaid)).toMatchObject({ ok: true });
    expect(check("Sirf 7999 lagenge.", teamSaid)).toMatchObject({ ok: true });
  });

  it("never reads a height, a year, a time, a date or a phone number as an amount", () => {
    const words =
      "Summit at 12,500 ft, 1,200 m climb. Batch of 2026, Sat 12 Dec, pickup 6 am or 18:30. Call +91 98765 43210.";
    expect(check(words)).toEqual({ ok: true, verdicts: [] });
  });

  it("reads a height or a distance in Hindi, hyphenated or spelled out as no amount (fix round 2)", () => {
    for (const words of [
      "केदारकांठा की ऊंचाई 3,800 मीटर है।",
      "समिट 12,500 फीट पर है।",
      "A 3,800-metre summit.",
      "A 12,500-ft summit.",
      "Summit 12,500 foot.",
      "Summit 3,800 mts.",
      "Delhi se 1,500 kilometres.",
    ])
      expect(check(words)).toEqual({ ok: true, verdicts: [] });
  });

  it("reads 2020 to 2035 as a year only right after a month or beside a year word (fix rounds 2 and 3)", () => {
    expect(check("Sirf 2000 extra lagenge.")).toMatchObject(refusedBy("G1"));
    expect(check("Bas 2030 aur lagenge.")).toMatchObject(refusedBy("G1"));
    // Outside 2020 to 2035 a number is money even beside a year word.
    expect(check("Hum 2015 batch se treks chala rahe hain.")).toMatchObject(refusedBy("G1"));
    // A month marks a year only right before the number; "mai" is Hinglish for "in" (fix round 3).
    expect(check("Sirf 2030 mai ho jayega.")).toMatchObject(refusedBy("G1"));
    expect(check("December mein 2030 extra lagenge.")).toMatchObject(refusedBy("G1"));
    expect(check("Sun, 2030 extra lagenge.")).toMatchObject(refusedBy("G1"));
    expect(check("Isme mai 2030 aur jod dunga.")).toMatchObject(refusedBy("G1"));
    for (const words of [
      "2026 batch full hai.",
      "Next year 2027 mein phir chalenge.",
      "साल 2026 में चलेंगे।",
      "दिसंबर 2026 का बैच भरा है।",
    ])
      expect(check(words)).toEqual({ ok: true, verdicts: [] });
  });

  it("reads a time with a leading zero and a pincode as no amount (fix round 2)", () => {
    for (const words of ["Pickup 0630 baje.", "Pickup: Dehradun 248001.", "Pin 248001 pe courier karenge."])
      expect(check(words)).toEqual({ ok: true, verdicts: [] });
    expect(check("Sirf 248001 lagenge.")).toMatchObject(refusedBy("G1"));
    // After a place, a money word after the number makes it money (fix round 3).
    expect(check("Goa 150000 me ho jayega.")).toMatchObject(refusedBy("G1"));
    expect(check("Ladakh: 125000 per couple.")).toMatchObject(refusedBy("G1"));
  });

  it("reads Devanagari digits as an amount", () => {
    expect(check("कुल ₹९,९९९ होगा")).toMatchObject(refusedBy("G1"));
    expect(check("कुल ₹९,४९९ प्रति व्यक्ति")).toMatchObject({ ok: true });
  });

  it("reads thousands in words: hazaar, thousand, हज़ार (pre-flight #15)", () => {
    expect(check("sirf 8 hazaar per person")).toMatchObject(refusedBy("G1"));
    expect(check("only 8 thousand per person")).toMatchObject(refusedBy("G1"));
    // हज़ार typed with the nukta as its own mark, and as one letter.
    expect(check("सिर्फ ८ हज\u093Cार")).toMatchObject(refusedBy("G1"));
    expect(check("सिर्फ ८ ह\u095Bार")).toMatchObject(refusedBy("G1"));
    expect(check("advance 3 hazaar per person")).toMatchObject({ ok: true });
  });

  it("doesn't read percentages or counts as money", () => {
    expect(check("4 nights, 10 people max")).toMatchObject({ ok: true, verdicts: [] });
    expect(check("50% back up to 15 days before; the summit is 12 thousand feet.")).toMatchObject({
      ok: true,
      verdicts: [],
    });
  });
});

describe("G2: an offer's words state its date and its advance", () => {
  const offered = (words: string, staged: LiveOffer = offer) => check(words, { offer: staged });

  it("passes an offer that states its day and month and its advance, in all or per person", () => {
    expect(offered("Sat 12 Dec, 3 log: ₹28,497. ₹9,000 advance se seats hold. Full name?")).toMatchObject({ ok: true });
    expect(offered("12 December for 3: advance ₹3,000 per person. Shall I hold it?")).toMatchObject({ ok: true });
    expect(offered("१२ दिसंबर, 3 लोग: एडवांस ₹९,००० है।")).toMatchObject({ ok: true });
  });

  it("retries an offer whose words lack its date or advance (G2)", () => {
    expect(offered("3 log: ₹28,497, advance ₹9,000. Full name?")).toMatchObject({
      ok: false,
      guard: "G2",
      fallback: "withdraw_offer",
      retry: "Your words must state the offer's date (Sat 12 Dec): the customer says yes to what they read.",
    });
    expect(offered("Sat 12 Dec, 3 log: ₹28,497. Full name?")).toMatchObject({
      ok: false,
      guard: "G2",
      retry:
        "Your words must state the offer's advance (₹9,000, or ₹3,000 per person): the customer says yes to what they read.",
    });
  });

  it("wants the total of an offer paid in full", () => {
    const inFull = { ...offer, payInFull: true };
    expect(offered("Sat 12 Dec, 3 log: ₹28,497, all now. Full name?", inFull)).toMatchObject({ ok: true });
    expect(offered("Sat 12 Dec, 3 log: advance ₹9,000. Full name?", inFull)).toMatchObject({
      guard: "G2",
      retry: "Your words must state the offer's total (₹28,497): the customer says yes to what they read.",
    });
  });

  it("doesn't run without an offer staged", () => {
    expect(check("3 log: ₹28,497. Batayein kab chalna hai?")).toMatchObject({
      ok: true,
      verdicts: [{ guard: "G1", passed: true }],
    });
  });
});

describe("G3: payment received or booking confirmed, only when the data shows it", () => {
  it("refuses 'we received your ₹4,000' while no payment is confirmed (G3)", () => {
    expect(check("We received your ₹4,000, thank you!")).toMatchObject({
      ok: false,
      guard: "G3",
      fallback: "fallback_task",
      retry: "No payment is recorded on this chat yet: don't say it came; say the team checks it and confirms here.",
    });
    // ₹9,000 is grounded (3 × the advance), so only G3 stands between this claim and the customer.
    expect(check("We received your ₹९,०००, thank you!")).toMatchObject(refusedBy("G3"));
  });

  it("passes a payment claim once the team recorded the payment", () => {
    expect(check("Payment mil gaya, thank you!", { paymentConfirmed: true })).toMatchObject({ ok: true });
  });

  it("passes 'Screenshot mil gaya' and 'once the payment is received'", () => {
    expect(check("Screenshot mil gaya, team check karke batayegi.")).toMatchObject({ ok: true });
    expect(check("Your seats are held once the payment is received.")).toMatchObject({ ok: true });
  });

  it("passes 'booking confirm ho gayi' when the data shows the booking confirmed", () => {
    expect(check("Aapki booking confirm ho gayi!", { bookingConfirmed: true })).toMatchObject({ ok: true });
    expect(check("Aapki booking confirm ho gayi!", { paymentConfirmed: true })).toMatchObject({
      ok: false,
      guard: "G3",
      retry:
        "The booking isn't confirmed yet: don't say it is; say the team confirms it here once the payment is checked.",
    });
  });

  it("checks a booking claim against the booking and a payment claim against the payment", () => {
    const bookingRetry = (check("Your seats are confirmed.", { paymentConfirmed: true }) as { retry?: string }).retry;
    expect(bookingRetry).toMatch(/^The booking isn't confirmed yet/u);
    const paymentRetry = (check("The advance has been received.", { bookingConfirmed: true }) as { retry?: string })
      .retry;
    expect(paymentRetry).toMatch(/^No payment is recorded/u);
  });
});

describe("G4: the team's word and discounts, only when owner or Team text holds them", () => {
  it("refuses 'team ne bola 10% off' with no Team line saying it, and passes it when one does (G4)", () => {
    expect(check("Team ne bola 10% off milega.")).toMatchObject({
      ok: false,
      guard: "G4",
      fallback: "hand_over_discount",
      retry: "No Team line in this chat says that: don't credit the team with it; say you'll check with them instead.",
    });
    expect(check("Team ne bola 10% off milega.", { teamLines: ["10% off for this group, approved"] })).toMatchObject({
      ok: true,
    });
    expect(check("Team ne bola 15% off milega.", { teamLines: ["10% off for this group, approved"] })).toMatchObject({
      guard: "G4",
      retry: "The Team lines don't say 15%: quote the team's own figure, or leave it out.",
    });
  });

  it("passes 'team se check karke batate hain'", () => {
    expect(check("Team se check karke batate hain.")).toMatchObject({ ok: true, verdicts: [] });
  });

  it("refuses a discount figure in no owner or Team text, with fallback hand_over_discount", () => {
    expect(check("Aapke liye ₹1,000 ka discount kar denge.")).toMatchObject({
      ok: false,
      guard: "G4",
      fallback: "hand_over_discount",
      retry:
        "No owner or Team text gives ₹1,000 off: leave the discount out; if they ask for one, hand_over(discount).",
    });
    expect(check("Students ko 10% discount milta hai.", { ownerText: "Students get 10% discount." })).toMatchObject({
      ok: true,
    });
  });

  it("passes a discount figure only where owner or Team text gives it as a discount (fix round 1)", () => {
    // The default answers' only 50% is the cancellation refund.
    expect(check("Aapke group ko 50% off milega!")).toMatchObject(refusedBy("G4"));
    expect(check("5% off milega.", { ownerText: "Prices are plus 5% GST." })).toMatchObject(refusedBy("G4"));
    expect(check("₹3,000 off kar denge.", { teamLines: ["Advance 3000 per head lena"] })).toMatchObject(
      refusedBy("G4"),
    );
    const groups = { answers: { ...answers, payment_methods: "UPI or bank transfer. 10% discount for groups of 6+." } };
    expect(check("10% off for groups of 6 or more.", groups)).toMatchObject({ ok: true });
    expect(check("₹500 off kar denge.", { teamLines: ["Inko 500 kam kar do"] })).toMatchObject({ ok: true });
  });

  it("reads 'off' as a discount only right after a figure", () => {
    expect(check("Pick-up and drop-off included: ₹9,499 per person.")).toMatchObject({ ok: true });
  });

  it("grounds a discount only where owner or Team text gives that figure as one (fix round 2)", () => {
    expect(
      check("₹3,000 off kar denge.", { teamLines: ["Advance 3000 per head lena, kam se kam 4 log"] }),
    ).toMatchObject(refusedBy("G4"));
    expect(check("₹7,000 off milega.", { teamLines: ["7000 se kam me mat dena"] })).toMatchObject(refusedBy("G4"));
    expect(check("₹2,000 off milega.", { teamLines: ["Advance 2000 kam se kam lena"] })).toMatchObject(refusedBy("G4"));
    const noDiscount = { ownerText: "No discount of 10% on peak dates." };
    expect(check("Aapko 10% off milega.", noDiscount)).toMatchObject(refusedBy("G4"));
    expect(check("Aapko 10% off milega.", { ownerText: "Winter offer: 10% off on all treks." })).toMatchObject({
      ok: true,
    });
  });

  it("grounds nothing from a discount owner or Team text says not to give (fix round 3)", () => {
    const refusals: [string, Setup][] = [
      ["Aapko 10% off milega.", { teamLines: ["Inko 10% discount mat dena"] }],
      ["₹500 off kar denge.", { teamLines: ["500 kam mat karna"] }],
      ["Aapko 10% off milega.", { teamLines: ["10% off mat bolna"] }],
      ["Aapko 10% off milega.", { ownerText: "We don't give a 10% discount." }],
      ["Aapko 10% off milega.", { ownerText: "10% off isn't possible." }],
      ["Aapko 10% off milega.", { ownerText: "A 10% discount is not possible on peak dates." }],
    ];
    for (const [words, setup] of refusals) expect(check(words, setup)).toMatchObject(refusedBy("G4"));
  });

  it("reads 'N% offer' in the reply as a discount, but never grounds one from 'offer' (fix round 3)", () => {
    expect(check("Aapko 10% offer hai.")).toMatchObject(refusedBy("G4"));
    expect(check("Aapko 10% offer hai.", { ownerText: "Students get 10% off." })).toMatchObject({ ok: true });
    expect(check("Aapko 10% off milega.", { ownerText: "10% offer for groups." })).toMatchObject(refusedBy("G4"));
  });
});

describe("G5: payment details only from code", () => {
  it("refuses a UPI handle, an IFSC or a payment link (G5)", () => {
    for (const words of [
      "Pay to casetrips@okbank and send the screenshot.",
      "Bank transfer: IFSC HDFC0001234.",
      "Pay here: https://rzp.io/l/casetrips",
    ])
      expect(check(words)).toMatchObject({
        ok: false,
        guard: "G5",
        fallback: "fallback_task",
        retry:
          "Leave payment details out of your words: the app sends the agency's own (resend_payment sends them again).",
      });
  });
});

describe("the order and the record", () => {
  it("checks claims before amounts, and records each guard that ran, passed or not", () => {
    expect(check("Booking confirm ho gayi! Total ₹28,497.", { bookingConfirmed: true })).toEqual({
      ok: true,
      verdicts: [
        { guard: "G3", passed: true, detail: "Booking confirm ho gayi" },
        { guard: "G1", passed: true, detail: "₹28,497" },
      ],
    });
    expect(check("We received your ₹4,000.")).toMatchObject({ verdicts: [{ guard: "G3", passed: false }] });
  });

  it("meets no guard on a plain itinerary answer", () => {
    expect(check("Day 1 Dehradun se Sankri, 220 km drive. Day 4 summit, 3 am start.")).toEqual({
      ok: true,
      verdicts: [],
    });
  });
});

describe("trace flags, which are not checks", () => {
  const flagContext = { sheets: [kedarkantha], ownerText: "", customerText: "", today };

  it("flags a date found in no departure, owner text or customer line, and a seat count the data doesn't hold", () => {
    expect(traceFlags("13 Dec ko 3 seats bachi hain", flagContext)).toEqual([
      "date_not_in_data:2026-12-13",
      "seats_differ:T1",
    ]);
  });

  it("flags nothing the data, the owner or the customer holds", () => {
    const fewSeats: TripSheet = {
      ...kedarkantha,
      departures: kedarkantha.departures.map((one) => (one.startsOn === "2026-12-19" ? { ...one, freeSeats: 3 } : one)),
    };
    const context = {
      ...flagContext,
      sheets: [fewSeats],
      ownerText: "Christmas camp on 24 Dec",
      customerText: "2 Jan?",
    };
    expect(traceFlags("19 Dec ko 3 seats bachi hain. 24 Dec camp, 2 Jan nahi.", context)).toEqual([]);
  });
});
