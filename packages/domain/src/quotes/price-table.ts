// A trip's price table (room types by seasons) saved in one transaction: its room types, and each column's label and prices.
import { roomTypes, type RoomPrices, type SavePriceTableInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { findPackageForChange } from "./package-row.js";
import { mergePackagePart } from "./package-part.js";
import { updatePackage } from "./package-edit.js";
import { savePackageSeason, seasonsOf } from "./package-seasons.js";

/** Only the sold room types keep a price. */
function soldOnly(prices: RoomPrices, sold: readonly string[]): RoomPrices {
  const kept = { ...prices };
  for (const type of roomTypes) if (!sold.includes(type)) kept[type] = null;
  return kept;
}

export async function savePriceTable(tx: OrgTx, access: MemberAccess, input: SavePriceTableInput): Promise<void> {
  const before = await findPackageForChange(tx, input.packageId);
  const seasons = await seasonsOf(tx, before.id);
  const byId = new Map(seasons.map((season) => [season.id, season]));
  const named = new Set<string>();
  input.columns.forEach((column, index) => {
    if (!input.roomTypes.some((type) => column.prices[type] !== null)) {
      throw new DomainError(
        "VALIDATION",
        "PRICE_TABLE_COLUMN_UNPRICED",
        `Column ${String(index + 1)} has no price for a room type the trip sells`,
      );
    }
    for (const id of column.seasonIds) {
      if (!byId.has(id)) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
      named.add(id);
    }
  });
  await updatePackage(tx, access, mergePackagePart(before, { packageId: before.id, roomTypes: input.roomTypes }));
  for (const column of input.columns) {
    for (const seasonId of column.seasonIds) {
      const season = byId.get(seasonId);
      if (season === undefined) continue;
      await savePackageSeason(tx, access, {
        packageId: before.id,
        seasonId,
        label: column.label,
        startsOn: season.startsOn,
        endsOn: season.endsOn,
        prices: soldOnly(column.prices, input.roomTypes),
      });
    }
  }
  // A season the table did not show still stops pricing a room type the trip no longer sells.
  for (const season of seasons) {
    if (named.has(season.id)) continue;
    const kept = soldOnly(season.prices, input.roomTypes);
    if (roomTypes.every((type) => kept[type] === season.prices[type])) continue;
    await savePackageSeason(tx, access, {
      packageId: before.id,
      seasonId: season.id,
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: kept,
    });
  }
}
