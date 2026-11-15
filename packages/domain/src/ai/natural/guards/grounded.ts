// G1's grounded set (spec 5, fix round 1's rulings): every amount the agency's data, this turn's quotes and the team
// stand behind, and the figures that follow from them (a balance, the GST itself, an owner's discount, a rupee rounded).
import type { AgencyAnswers, ToldTotal } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import type { QuoteFigures, TripSheet } from "../types.js";
import { amountsIn, discountFiguresIn, looseAmountsIn } from "./amounts.js";

export interface GroundedSet {
  /** Whether the data holds the amount: exactly, or within 1% when it was written as shorthand ("9.5k"). */
  has(paise: number, shorthand: boolean): boolean;
}

interface Tax {
  pricesIncludeGst: boolean;
  taxRateBasisPoints: number;
}

const MONTH_MS = 30 * 86_400_000;
/** A per-person figure for 1 to 10 people, so "₹9,499 × 3 = ₹28,497" needs no tool call. */
const PEOPLE = Array.from({ length: 10 }, (_, index) => index + 1);
const NO_TAX: Tax = { pricesIncludeGst: true, taxRateBasisPoints: 0 };

/** The figures, each also rounded to the rupee either way (₹32,287.50 is written ₹32,287 or ₹32,288). */
export function groundedSetOf(amounts: Iterable<number>): GroundedSet {
  const exact = new Set<number>();
  for (const paise of amounts)
    exact
      .add(paise)
      .add(Math.floor(paise / 100) * 100)
      .add(Math.ceil(paise / 100) * 100);
  return {
    has: (paise, shorthand) =>
      exact.has(paise) || (shorthand && [...exact].some((one) => Math.abs(one - paise) * 100 <= one)),
  };
}

/** The trip's customer-facing owner text, for the amounts and dates it names. */
export function tripTextOf(sheet: TripSheet): string {
  return [
    sheet.summary,
    ...sheet.highlights,
    ...sheet.days.flatMap((one) => [one.title, one.text]),
    ...sheet.pickups,
    sheet.inclusions,
    sheet.exclusions,
    sheet.notes,
    sheet.cancellation,
  ].join("\n");
}

const gstOn = (paise: number, tax: Tax) => Math.round((paise * tax.taxRateBasisPoints) / 10_000);

/**
 * What `people` pay at a per-person price, as the quote and a person work it out: the price times the people; when
 * prices exclude GST, the GST on top and the sum (on the group, and per person times the people); and the balance after
 * their advances (fix round 1's ruling). A price that includes GST shows no split, so its GST share is never grounded:
 * rounded to the rupee, those shares would ground round figures nobody stated (₹999.90 makes ₹1,000).
 */
function groupFigures(price: number, people: number, tax: Tax, advance: number | null): number[] {
  const amount = price * people;
  const totals =
    tax.pricesIncludeGst || tax.taxRateBasisPoints === 0
      ? { gst: [], withGst: [amount] }
      : {
          gst: [gstOn(amount, tax), gstOn(price, tax) * people],
          withGst: [amount + gstOn(amount, tax), (price + gstOn(price, tax)) * people],
        };
  const balances = advance === null ? [] : totals.withGst.map((total) => total - advance * people);
  return [amount, ...totals.withGst, ...totals.gst, ...balances];
}

/** A trip's figures: its prices (seasons not ended, each departure's own, the from-price, and less an owner's discount). */
function sheetAmounts(sheet: TripSheet, today: CalendarDate, discounts: readonly number[]): number[] {
  const prices = new Set(
    [
      ...sheet.seasons.filter((season) => season.until >= today).map((season) => season.perPersonPaise),
      ...sheet.departures.map((one) => one.perPersonPaise),
    ].flatMap((byRoom) => Object.values(byRoom)),
  );
  if (sheet.fromPaise !== null) prices.add(sheet.fromPaise);
  const discounted = [...prices].flatMap((price) =>
    discounts.map((percent) => Math.round((price * (100 - percent)) / 100)),
  );
  const advance = sheet.advancePerPersonPaise;
  return [
    ...[...prices, ...discounted].flatMap((price) =>
      PEOPLE.flatMap((people) => groupFigures(price, people, sheet, advance)),
    ),
    ...(advance === null ? [] : PEOPLE.map((people) => advance * people)),
    ...amountsIn(tripTextOf(sheet)).map((one) => one.paise),
  ];
}

/** A quote's figures (a date past the sheet's 8 has its own price), its balance, and its GST by its trip's tax. */
function quotedAmounts(quote: QuoteFigures, tax: Tax): number[] {
  const { totalPaise, advancePaise, perPersonPaise, advancePerPersonPaise } = quote;
  // The total includes GST; when the trip's prices exclude it, the quote's words show the GST on top: its share here.
  const shownGst =
    tax.pricesIncludeGst || tax.taxRateBasisPoints === 0
      ? []
      : [totalPaise - Math.round((totalPaise * 10_000) / (10_000 + tax.taxRateBasisPoints))];
  return [
    totalPaise,
    advancePaise,
    totalPaise - advancePaise,
    ...shownGst,
    ...PEOPLE.flatMap((people) => [
      ...groupFigures(perPersonPaise, people, tax, advancePerPersonPaise),
      advancePerPersonPaise * people,
    ]),
  ];
}

/**
 * The amounts G1 lets through this turn: spec 5's list (table prices of seasons not ended and each departure's own, per
 * room and with GST when prices exclude it, the from-prices and advances, each for 1 to 10 people; this turn's quote
 * figures; totals told in the last 30 days; amounts in the answers, trip text and Team lines, which the caller passes
 * for the last 30 days) and what follows from them: the balance after the advance, the GST itself, a price less a
 * discount percent that owner or Team text gives, and each rounded to the rupee. Never the customer's amounts.
 */
export function groundedAmounts(input: {
  sheets: readonly TripSheet[];
  today: CalendarDate;
  answers: AgencyAnswers;
  teamLines: readonly string[];
  told: readonly ToldTotal[];
  quoted: readonly QuoteFigures[];
  now: Date;
}): GroundedSet {
  const sheetOf = (packageId: string) => input.sheets.find((sheet) => sheet.packageId === packageId);
  const answers = Object.values(input.answers);
  const texts = [...answers, ...input.teamLines, ...input.sheets.map(tripTextOf)];
  const discounts = [...new Set(texts.flatMap((text) => discountFiguresIn(text).percents))].filter(
    (percent) => percent > 0 && percent < 100,
  );
  const told = input.told
    .filter((one) => input.now.getTime() - Date.parse(one.at) <= MONTH_MS)
    .flatMap((one) => {
      const advance = sheetOf(one.packageId)?.advancePerPersonPaise ?? null;
      const people = one.adults + one.childrenAges.length;
      return advance === null ? [one.totalPaise] : [one.totalPaise, one.totalPaise - advance * people];
    });
  return groundedSetOf(
    [
      ...input.sheets.flatMap((sheet) => sheetAmounts(sheet, input.today, discounts)),
      ...input.quoted.flatMap((quote) => quotedAmounts(quote, sheetOf(quote.terms.packageId) ?? NO_TAX)),
      ...told,
      ...answers.flatMap((answer) => amountsIn(answer)).map((one) => one.paise),
      ...input.teamLines.flatMap((line) => looseAmountsIn(line)).map((one) => one.paise),
    ].filter((paise) => paise > 0),
  );
}
