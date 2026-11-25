// Special prices for some dates: the package's seasons around those dates are shortened, split or removed to make room.
import { OPEN_SEASON_END, type SaveSpecialPricesInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { addDays, parseCalendarDate, type CalendarDate } from "../kernel/index.js";
import { removePackageSeason, savePackageSeason, seasonsOf } from "./package-seasons.js";

/** Seasons are shrunk and removed first and the new period added last, so no write ever overlaps. */
export async function saveSpecialPrices(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveSpecialPricesInput,
): Promise<{ id: string }> {
  const { packageId } = input;
  const start = parseCalendarDate(input.startsOn);
  const seasons = await seasonsOf(tx, packageId);
  const covering = seasons.find((season) => season.startsOn <= start && season.endsOn >= start);
  // With nothing covering the start, "until I change them" stops short of the next season, so that season keeps its prices; with none it never ends.
  const next = seasons.find((season) => season.startsOn > start);
  const end =
    (input.endsOn === null ? null : parseCalendarDate(input.endsOn)) ??
    covering?.endsOn ??
    (next === undefined ? parseCalendarDate(OPEN_SEASON_END) : addDays(next.startsOn, -1));
  const save = (season: {
    id?: string;
    label: string;
    startsOn: CalendarDate;
    endsOn: CalendarDate;
    prices: typeof input.prices;
  }) =>
    savePackageSeason(tx, access, {
      packageId,
      ...(season.id === undefined ? {} : { seasonId: season.id }),
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: season.prices,
    });
  const afterwards: Parameters<typeof save>[0][] = [];
  for (const season of seasons) {
    if (season.endsOn < start || season.startsOn > end) continue;
    const startsBefore = season.startsOn < start;
    const endsAfter = season.endsOn > end;
    if (startsBefore) await save({ ...season, endsOn: addDays(start, -1) });
    else if (endsAfter) await save({ ...season, startsOn: addDays(end, 1) });
    else await removePackageSeason(tx, access, season.id);
    if (startsBefore && endsAfter) {
      afterwards.push({ label: season.label, startsOn: addDays(end, 1), endsOn: season.endsOn, prices: season.prices });
    }
  }
  const created = await save({ label: input.label, startsOn: start, endsOn: end, prices: input.prices });
  for (const rest of afterwards) await save(rest);
  return created;
}
