// The review of a rate sheet as the form holds it (release ai3b): the AI's proposal turned into editable drafts, which problems
// stop a save, and the save's input from what the person left, edited and ticked. The AI's proposal itself is never sent back: only
// these drafts, as the person made them. A rate is saved only when every row to be saved has its own "checked" tick.
import type { RateSheetProposal, SaveRateBatchInput } from "@travel-crm/contracts/ai";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { rateUnits, type RateSeason } from "@travel-crm/contracts/suppliers";
import { rupeesFieldText } from "@/components/forms/money-field";

/** A select cannot hold an empty value, so "no meal plan" is "none" in the form. */
export const NONE = "none";
const stored = (value: string) => (value === NONE ? "" : value);

/** Seasons the supplier already has are offered to the rows from this key on. */
export const SUPPLIER_SEASON_KEY = 100;

export interface SeasonDraft {
  key: number;
  label: string;
  /** yyyy-mm-dd, or "" while the sheet's dates could not be read and the person has not chosen them. */
  startsOn: string;
  endsOn: string;
  /** The supplier's season with exactly these dates, which the rows go in. */
  existingSeasonId: string | null;
  printed: string;
  inPast: boolean;
}

export interface RowDraft {
  ref: string;
  /** The season's key as text (a select holds text); "" while none is chosen. */
  seasonKey: string;
  item: string;
  mealPlan: string;
  occupancy: string;
  /** A rate unit, or "" while the sheet did not say: the screen shows "Choose". */
  unit: string;
  /** Rupees as typed. */
  price: string;
  note: string;
  checked: boolean;
  /** Not saved: the supplier already has it, or the person left it out. */
  left: boolean;
  already: boolean;
  printedPrice: string;
  source: string;
  excerpt: string;
  checkThis: boolean;
  /** The supplier's rate this row is, with the key it matched on and what it costs now. */
  existing: { rateId: string; costPaise: number; seasonKey: string; key: string } | null;
}

export interface DraftValues {
  seasons: SeasonDraft[];
  rows: RowDraft[];
}

const keyOf = (row: Pick<RowDraft, "item" | "mealPlan" | "occupancy" | "unit">) =>
  [row.item.trim().toLowerCase(), row.mealPlan, row.occupancy, row.unit].join("|");

export function draftOf(proposal: RateSheetProposal): DraftValues {
  const seasons: SeasonDraft[] =
    proposal.seasons.length > 0
      ? proposal.seasons.map((season) => ({
          key: season.ref,
          label: season.label,
          startsOn: season.startsOn ?? "",
          endsOn: season.endsOn ?? "",
          existingSeasonId: season.existingSeasonId,
          printed: season.printed,
          inPast: season.inPast,
        }))
      : [{ key: 0, label: "", startsOn: "", endsOn: "", existingSeasonId: null, printed: "", inPast: false }];
  const only = seasons.length === 1 ? String(seasons[0]?.key ?? 0) : "";
  const rows = proposal.rates.map((rate): RowDraft => {
    const seasonKey = rate.seasonRef === null ? only : String(rate.seasonRef);
    const draft = {
      item: rate.item,
      mealPlan: rate.mealPlan === "" ? NONE : rate.mealPlan,
      occupancy: rate.occupancy === "" ? NONE : rate.occupancy,
      unit: rate.unit ?? "",
    };
    const already = rate.existing !== null && rate.existing.costPaise === rate.costPaise;
    return {
      ref: rate.ref,
      seasonKey,
      ...draft,
      price: rate.costPaise === null ? "" : rupeesFieldText(rate.costPaise),
      note: rate.note,
      checked: false,
      left: already,
      already,
      printedPrice: rate.printedPrice,
      source: rate.source,
      excerpt: rate.excerpt,
      checkThis: rate.checkThis,
      existing:
        rate.existing === null
          ? null
          : {
              ...rate.existing,
              seasonKey,
              key: keyOf({ ...draft, mealPlan: stored(draft.mealPlan), occupancy: stored(draft.occupancy) }),
            },
    };
  });
  return { seasons, rows };
}

export type RowProblem = "season" | "item" | "unit" | "price" | "same";
export type SeasonProblem = "label" | "dates" | "order";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/** The seasons the rows to be saved go in that are new, with what is wrong with each. */
export function seasonProblems(values: DraftValues): Map<number, SeasonProblem> {
  const found = new Map<number, SeasonProblem>();
  const used = new Set(values.rows.filter((row) => !row.left).map((row) => row.seasonKey));
  for (const season of values.seasons) {
    if (!used.has(String(season.key)) || season.existingSeasonId !== null) continue;
    if (season.label.trim() === "") found.set(season.key, "label");
    else if (!dayPattern.test(season.startsOn) || !dayPattern.test(season.endsOn)) found.set(season.key, "dates");
    else if (season.endsOn < season.startsOn) found.set(season.key, "order");
  }
  return found;
}

/** What is wrong with each row to be saved, by its place in the rows. */
export function rowProblems(values: DraftValues, supplierSeasons: readonly RateSeason[]): Map<number, RowProblem> {
  const found = new Map<number, RowProblem>();
  const taken = new Map<string, number>();
  values.rows.forEach((row, index) => {
    if (row.left) return;
    const number = row.seasonKey === "" ? Number.NaN : Number(row.seasonKey);
    const known =
      number >= SUPPLIER_SEASON_KEY
        ? supplierSeasons[number - SUPPLIER_SEASON_KEY] !== undefined
        : values.seasons.some((season) => season.key === number);
    if (!known) found.set(index, "season");
    else if (row.item.trim() === "") found.set(index, "item");
    else if (!(rateUnits as readonly string[]).includes(row.unit)) found.set(index, "unit");
    else if (!pricePositive(row.price)) found.set(index, "price");
    else {
      const place = `${row.seasonKey}#${keyOf(row)}`;
      if (taken.has(place)) found.set(index, "same");
      else taken.set(place, index);
    }
  });
  return found;
}

function pricePositive(text: string): boolean {
  const paise = paiseFromRupeesText(text);
  return paise !== null && paise > 0;
}

/** Rows that would be saved, and whether Save is open: every one of them valid and ticked, at least one. */
export function saveState(values: DraftValues, supplierSeasons: readonly RateSeason[]) {
  const included = values.rows.filter((row) => !row.left);
  const problems = rowProblems(values, supplierSeasons);
  const seasons = seasonProblems(values);
  const unticked = included.filter((row) => !row.checked).length;
  return {
    count: included.length,
    unticked,
    problems,
    seasons,
    canSave: included.length > 0 && unticked === 0 && problems.size === 0 && seasons.size === 0,
  };
}

/** The save's input from the drafts. Null when it could not be made (the caller shows what is wrong first). */
export function batchOf(
  values: DraftValues,
  supplierSeasons: readonly RateSeason[],
  ids: { supplierId: string; fillId: string },
): SaveRateBatchInput | null {
  if (!saveState(values, supplierSeasons).canSave) return null;
  const included = values.rows.filter((row) => !row.left);
  const keys = [...new Set(included.map((row) => Number(row.seasonKey)))];
  const seasons = keys.flatMap((key): SaveRateBatchInput["seasons"] => {
    if (key >= SUPPLIER_SEASON_KEY) {
      const season = supplierSeasons[key - SUPPLIER_SEASON_KEY];
      return season === undefined ? [] : [{ key, seasonId: season.id, label: season.label }];
    }
    const season = values.seasons.find((one) => one.key === key);
    if (season === undefined) return [];
    return season.existingSeasonId === null
      ? [{ key, label: season.label.trim(), startsOn: season.startsOn, endsOn: season.endsOn }]
      : [{ key, seasonId: season.existingSeasonId, label: season.label }];
  });
  const rates = included.flatMap((row) => {
    const costPaise = paiseFromRupeesText(row.price);
    if (costPaise === null) return [];
    // A rate the supplier has is changed only when the row is still that rate; edited into another, it is a new one.
    const sameRate =
      row.existing !== null && row.existing.seasonKey === row.seasonKey && row.existing.key === keyOf(row);
    return [
      {
        ref: row.ref,
        seasonKey: Number(row.seasonKey),
        ...(sameRate && row.existing !== null ? { rateId: row.existing.rateId } : {}),
        item: row.item.trim(),
        mealPlan: stored(row.mealPlan) as "",
        occupancy: stored(row.occupancy) as "",
        unit: row.unit as "per_day",
        costPaise,
        note: row.note.trim(),
        checked: true as const,
      },
    ];
  });
  return { ...ids, seasons, rates };
}
