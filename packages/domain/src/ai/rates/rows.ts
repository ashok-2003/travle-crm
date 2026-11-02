// The model's answer about a rate sheet as the proposal's seasons and rows, made by code (design 3.2): enums kept to 7b's own lists,
// the price made paise from what was printed, dates made days, the words and place of each row taken from the sheet's own line it
// names, the printed number looked for in that line, tax words kept in the note, and each row compared with what the supplier already has.
import {
  RATE_SHEET_ROWS_MAX,
  RATE_SHEET_SEASONS_MAX,
  type RateSheetRow,
  type RateSheetSeason,
} from "@travel-crm/contracts/ai";
import { rateMealPlans, rateOccupancies, rateUnits, type SupplierRateCatalog } from "@travel-crm/contracts/suppliers";
import { hashOf } from "../suggest.js";
import { parsePrintedPrice, priceInLine, taxWordsIn } from "./price.js";
import { parsePrintedDay } from "./season-dates.js";
import type { SourceLine } from "./source.js";

const NOTE_CHARACTERS = 300;
const QUESTIONS_MAX = 8;

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (typeof value === "object" && value !== null ? (value as Json) : {});
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export interface ProposedRates {
  seasons: RateSheetSeason[];
  rates: RateSheetRow[];
  questions: string[];
  /** More rates were printed than one read takes. */
  cut: boolean;
}

/** What is compared when a person edits a row after it was proposed: the same row, the same price. */
export const rowHash = (row: {
  item: string;
  mealPlan: string;
  occupancy: string;
  unit: string | null;
  costPaise: number | null;
}): string =>
  hashOf(`${row.item.toLowerCase()}|${row.mealPlan}|${row.occupancy}|${row.unit ?? ""}|${String(row.costPaise ?? "")}`);

const sameKey = (
  a: { item: string; mealPlan: string; occupancy: string; unit: string | null },
  b: { item: string; mealPlan: string; occupancy: string; unit: string },
) =>
  a.item.toLowerCase() === b.item.toLowerCase() &&
  a.mealPlan === b.mealPlan &&
  a.occupancy === b.occupancy &&
  a.unit === b.unit;

function seasonsOf(answer: Json, today: string, catalog: SupplierRateCatalog) {
  return listOf(answer.seasons)
    .slice(0, RATE_SHEET_SEASONS_MAX)
    .map((item, index): RateSheetSeason => {
      const one = record(item);
      const from = text(one.from, 40);
      const to = text(one.to, 40);
      let startsOn = parsePrintedDay(from);
      let endsOn = parsePrintedDay(to);
      // A season that ends before it begins was misread: both are asked for.
      if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
        startsOn = null;
        endsOn = null;
      }
      const label = text(one.label, 80) || `Season ${String(index + 1)}`;
      const existing =
        startsOn === null || endsOn === null
          ? undefined
          : catalog.seasons.find((season) => season.startsOn === startsOn && season.endsOn === endsOn);
      return {
        ref: index,
        label,
        startsOn,
        endsOn,
        printed: [from, to].filter((part) => part !== "").join(" to "),
        existingSeasonId: existing?.id ?? null,
        inPast: endsOn !== null && endsOn < today,
      };
    });
}

/** The proposal's seasons and rows from the model's JSON. `lines` are the part's lines by token; null for photos. */
export function proposedRates(
  answer: unknown,
  source: { lines: ReadonlyMap<string, SourceLine> } | { photos: number },
  today: string,
  catalog: SupplierRateCatalog,
): ProposedRates {
  const json = record(answer);
  const lines = "lines" in source ? source.lines : new Map<string, SourceLine>();
  const seasons = seasonsOf(json, today, catalog);
  const all = listOf(json.rates);
  const cut = all.length > RATE_SHEET_ROWS_MAX;
  const rates: RateSheetRow[] = [];
  for (const item of all.slice(0, RATE_SHEET_ROWS_MAX)) {
    const one = record(item);
    const name = text(one.item, 160);
    if (name === "") continue;
    const printedPrice = text(one.price, 40);
    if (printedPrice === "") continue;
    const rawSeason = one.season;
    const seasonRef =
      typeof rawSeason === "number" && Number.isInteger(rawSeason) && rawSeason >= 0 && rawSeason < seasons.length
        ? rawSeason
        : seasons.length === 1
          ? 0
          : null;
    const mealPlan = (rateMealPlans as readonly string[]).includes(text(one.mealPlan, 8)) ? text(one.mealPlan, 8) : "";
    const occupancy = (rateOccupancies as readonly string[]).includes(text(one.occupancy, 20))
      ? text(one.occupancy, 20)
      : "";
    const unit = (rateUnits as readonly string[]).includes(text(one.unit, 20)) ? text(one.unit, 20) : null;
    const costPaise = parsePrintedPrice(printedPrice);
    const line = typeof one.line === "string" ? lines.get(one.line.trim().toUpperCase()) : undefined;
    const photo = typeof one.photo === "number" && "photos" in source && one.photo >= 1 && one.photo <= source.photos;
    const tax = taxWordsIn(printedPrice, line?.text ?? "");
    const note = [text(one.note, 200), tax.length === 0 ? "" : `Printed: ${tax.join(", ")}`]
      .filter((part) => part !== "")
      .join(". ")
      .slice(0, NOTE_CHARACTERS);
    const season = seasonRef === null ? undefined : seasons[seasonRef];
    const existingSeason =
      season?.existingSeasonId == null ? undefined : catalog.seasons.find((one) => one.id === season.existingSeasonId);
    const existing =
      unit === null
        ? undefined
        : existingSeason?.rates.find((rate) => sameKey({ item: name, mealPlan, occupancy, unit }, rate));
    rates.push({
      ref: `r${String(rates.length + 1)}`,
      seasonRef,
      item: name,
      mealPlan: mealPlan as RateSheetRow["mealPlan"],
      occupancy: occupancy as RateSheetRow["occupancy"],
      unit: unit as RateSheetRow["unit"],
      printedPrice,
      costPaise,
      note,
      source: line?.source ?? (photo ? `Photo ${String(one.photo)}` : ""),
      excerpt: line?.text ?? "",
      // A photo is never checked by code, and a printed number that is not in its line is not to be taken on trust.
      checkThis: costPaise === null || (line === undefined ? true : !priceInLine(printedPrice, line.text)),
      existing: existing === undefined ? null : { rateId: existing.id, costPaise: existing.costPaise },
    });
  }
  const questions = listOf(json.questions)
    .map((question) => text(question, 200))
    .filter((question) => question !== "")
    .slice(0, QUESTIONS_MAX);
  return { seasons, rates, questions, cut };
}
