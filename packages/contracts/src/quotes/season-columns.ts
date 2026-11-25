// A trip's seasons grouped into price-table columns: pieces with the same label and prices (Regular split around
// Christmas) are one column, so the table shows each price once.
import { OPEN_SEASON_END, type PackageSeasonView } from "./packages.js";
import { roomTypes, type RoomPrices } from "./room-prices.js";

export interface SeasonColumn {
  /** The first season's id: stable while the column keeps its first piece. */
  key: string;
  label: string;
  seasonIds: string[];
  ranges: { startsOn: string; endsOn: string }[];
  prices: RoomPrices;
  /** True when a range lasts until changed. */
  open: boolean;
}

const DAY_MS = 86_400_000;
const daysIn = (range: { startsOn: string; endsOn: string }) =>
  (Date.parse(`${range.endsOn}T00:00:00Z`) - Date.parse(`${range.startsOn}T00:00:00Z`)) / DAY_MS + 1;
const sameKey = (season: PackageSeasonView) =>
  JSON.stringify([season.label, ...roomTypes.map((type) => season.prices[type])]);

/** Columns in the order a table reads: the open one first, else the one covering the most days, then the earliest. */
export function seasonColumns(seasons: readonly PackageSeasonView[]): SeasonColumn[] {
  const sorted = [...seasons].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id));
  const grouped = new Map<string, SeasonColumn>();
  for (const season of sorted) {
    const key = sameKey(season);
    const range = { startsOn: season.startsOn, endsOn: season.endsOn };
    const found = grouped.get(key);
    if (found) {
      found.seasonIds.push(season.id);
      found.ranges.push(range);
      found.open ||= range.endsOn === OPEN_SEASON_END;
    } else {
      grouped.set(key, {
        key: season.id,
        label: season.label,
        seasonIds: [season.id],
        ranges: [range],
        prices: { ...season.prices },
        open: range.endsOn === OPEN_SEASON_END,
      });
    }
  }
  const days = (column: SeasonColumn) => column.ranges.reduce((sum, range) => sum + daysIn(range), 0);
  return [...grouped.values()].sort(
    (a, b) =>
      Number(b.open) - Number(a.open) ||
      (a.open ? 0 : days(b) - days(a)) ||
      (a.ranges[0]?.startsOn ?? "").localeCompare(b.ranges[0]?.startsOn ?? ""),
  );
}
