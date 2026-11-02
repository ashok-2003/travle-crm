// Saving the rates read from a rate sheet (release ai3b): the rows a person checked, as they edited them, in one transaction, all or
// nothing, through the supplier's own season and rate writes (their overlap and duplicate checks, their audit entries, each marked
// with the AI reading they began as). The AI's proposal is never saved: only what arrives here. The AI's own audit entry for the
// reading is the router's (recordRatesApplied), in the same transaction.
import type { SaveRateBatchInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { saveRate, saveSeason } from "./rates.js";

const invalid = (message: string) => new DomainError("VALIDATION", "VALIDATION", message);

export async function saveRateBatch(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveRateBatchInput,
): Promise<{ seasons: number; rates: number }> {
  const options = { aiFillId: input.fillId };
  const ids = new Map<number, string>();
  let created = 0;
  for (const season of input.seasons) {
    if (ids.has(season.key)) throw invalid("Two seasons have the same key");
    if (season.seasonId !== undefined) {
      // A season the supplier has: the rows go in it as it is, never changed here.
      const found = await tx.supplierRateSeason.findFirst({
        where: { id: season.seasonId, supplierId: input.supplierId },
        select: { id: true },
      });
      if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such season");
      ids.set(season.key, found.id);
      continue;
    }
    if (season.label === "" || season.startsOn === undefined || season.endsOn === undefined) {
      throw invalid("A new season needs a name and its first and last day");
    }
    const saved = await saveSeason(
      tx,
      access,
      { supplierId: input.supplierId, label: season.label, startsOn: season.startsOn, endsOn: season.endsOn },
      options,
    );
    ids.set(season.key, saved.id);
    created += 1;
  }
  for (const rate of input.rates) {
    const seasonId = ids.get(rate.seasonKey);
    if (seasonId === undefined) throw invalid("A rate names a season that isn't in the save");
    await saveRate(
      tx,
      access,
      {
        seasonId,
        ...(rate.rateId === undefined ? {} : { rateId: rate.rateId }),
        item: rate.item,
        mealPlan: rate.mealPlan,
        occupancy: rate.occupancy,
        unit: rate.unit,
        costPaise: rate.costPaise,
        note: rate.note,
      },
      options,
    );
  }
  return { seasons: created, rates: input.rates.length };
}
