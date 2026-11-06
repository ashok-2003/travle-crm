// The card the writing model reads: each looked-up package in words, and the placeholders it may use for amounts, days and
// seats. The values sit beside the text, never in it; code fills them in after the model has written (fill.ts).
import { withoutAmountsAndDates, withoutPaymentDetails } from "@travel-crm/contracts/ai";
import { formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import type { Lookup, LookupPackage, PackageWhy } from "./lookup.js";

export interface Card {
  text: string;
  /** Placeholder (as written, "[price P1 double]") to the words that replace it. */
  values: Map<string, string>;
}

/** A placeholder and what it stands for, which is all the model is told about it. */
interface Entry {
  placeholder: string;
  meaning: string;
  value: string;
}

function entriesOf(lookup: Lookup, one: LookupPackage, key: string): Entry[] {
  const entries: Entry[] = [];
  const add = (name: string, meaning: string, value: string) =>
    entries.push({ placeholder: `[${name}]`, meaning, value });
  const day = (value: CalendarDate) => formatShortDay(value, lookup.today);
  // A price entered without GST is read out as such; the total and the advance are what the customer pays.
  const perPerson = (paise: number) => formatRupees(paise) + (one.pricesIncludeGst ? "" : " + GST");
  for (const type of one.offered) {
    const price = one.prices?.[type] ?? null;
    if (price !== null) add(`price ${key} ${type}`, `per person in a ${type} room on the asked date`, perPerson(price));
  }
  for (const type of one.offered) {
    const price = one.from[type];
    if (price !== null) add(`from ${key} ${type}`, `lowest coming price per person, ${type} room`, perPerson(price));
  }
  if (one.fromPaise !== null) add(`from ${key}`, "lowest price per person", perPerson(one.fromPaise));
  if (one.total !== null) add(`total ${key}`, "the chat's rooms together on the asked date", formatRupees(one.total));
  if (one.chosenDeparture !== null) {
    add(`departure ${key}`, "the departure the customer asked for", day(one.chosenDeparture.startsOn));
    add(`seats ${key}`, "seats left on it", String(one.chosenDeparture.freeSeats));
  }
  one.departures.forEach((departure, index) => {
    add(`departure ${key} ${String(index + 1)}`, `the ${String(index + 1)}th next departure`, day(departure.startsOn));
    add(
      `seats ${key} ${String(index + 1)}`,
      `seats left on departure ${String(index + 1)}`,
      String(departure.freeSeats),
    );
  });
  if (one.advancePerPersonPaise !== null) {
    add(`advance ${key}`, "advance per person", formatRupees(one.advancePerPersonPaise));
    if (lookup.travellers !== null) {
      add(
        `advance total ${key}`,
        "advance for all travellers",
        formatRupees(one.advancePerPersonPaise * lookup.travellers),
      );
    }
  }
  if (one.pickupPoints !== "") add(`pickup ${key}`, "the pickup points", one.pickupPoints);
  return entries;
}

const whyWords = (why: PackageWhy): string =>
  why.kind === "chosen"
    ? "the package this chat settled on"
    : why.kind === "place"
      ? `runs the place the customer named: ${why.words}`
      : `nearest to a place the agency doesn't run: ${why.words.join(", ")}`;

/** The agency typed this free text, maybe with a price, a date or an account gone stale: only code writes figures. */
const clean = (text: string): string => withoutAmountsAndDates(withoutPaymentDetails(text));

function textOf(lookup: Lookup, one: LookupPackage, key: string, entries: Entry[]): string[] {
  const lines = [
    `${key}: ${clean(one.title)} (${one.kind === "group" ? "group departures" : "custom trip"}), ${whyWords(one.why)}`,
  ];
  const line = (label: string, value: string) => {
    if (value.trim() !== "") lines.push(`  ${label}: ${value.trim()}`);
  };
  line("Destination", one.destination ?? "");
  line("Nights", one.nights === null ? "" : String(one.nights));
  line("Summary", clean(one.summary));
  line("Highlights", one.highlights.map(clean).join("; "));
  line("Includes", clean(one.inclusions));
  line("Excludes", clean(one.exclusions));
  line("Days", one.dayTitles.map(clean).join("; "));
  line("Starts from", one.startCity);
  line("Prices", one.kind === "group" ? (one.pricesIncludeGst ? "include GST" : "plus GST") : "");
  if (one.kind === "group" && one.chosenDeparture === null && lookup.startsOn !== null) {
    lines.push("  No open departure on the asked date: the team will confirm it.");
  }
  if (entries.length > 0) {
    lines.push("  Placeholders you may write (code fills them in; never write a figure yourself):");
    for (const entry of entries) lines.push(`    ${entry.placeholder} = ${entry.meaning}`);
  }
  return lines;
}

export function buildCard(lookup: Lookup): Card {
  const values = new Map<string, string>();
  const lines: string[] = [];
  lookup.packages.forEach((one, index) => {
    const key = `P${String(index + 1)}`;
    const entries = entriesOf(lookup, one, key);
    for (const entry of entries) values.set(entry.placeholder, entry.value);
    lines.push(...textOf(lookup, one, key, entries));
  });
  if (lookup.packages.length === 0) lines.push("No package matches yet.");
  if (lookup.notRun.length > 0) lines.push(`Places the agency doesn't run: ${lookup.notRun.join(", ")}`);
  lines.push(`Custom trips: ${lookup.customTrips ? "the agency plans them" : "not offered"}`);
  return { text: lines.join("\n"), values };
}
