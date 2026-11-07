// Making quotes from a package (release 7b): each chosen tier becomes a quote of its own for the lead, options of the same
// enquiry, priced from the supplier season covering the start date. A line with no rate for the date becomes a "needs a rate"
// line at zero: prices are never invented, and a quote with such a line is not sent until a person prices it. Also the helper
// beside "From ₹X": the cheapest tier for two adults in the next season.
import {
  quoteTaxRate,
  type CalculatedFromPrice,
  type MadeQuotes,
  type MakeQuotesFromPackageInput,
  type PackageTier,
  type QuantityRule,
  type QuoteItem,
  type TierLine,
} from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { getLead } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, type CalendarDate } from "../kernel/index.js";
import { tiersOf } from "./package-edit.js";
import { findPackage } from "./package-row.js";
import { itemOf, pricedLineOn } from "./rate-pricing.js";
import { daysOf, itemsOf } from "./quote-rows.js";
import { createQuote, type QuoteContext } from "./quotes.js";

const MAX_QUANTITY = 1000;

/** How many of a line a quote gets. Rooms are the travellers over two, rounded up; a day trip counts as one night. */
export function quantityFor(rule: QuantityRule, fixed: number, party: { travellers: number; nights: number }): number {
  const nights = Math.max(1, party.nights);
  const travellers = Math.max(1, party.travellers);
  const count = {
    fixed,
    per_traveller: travellers,
    per_night: nights,
    per_room_night: Math.ceil(travellers / 2) * nights,
    per_person_night: travellers * nights,
  }[rule];
  return Math.min(MAX_QUANTITY, Math.max(1, count));
}

/** A tier's lines as quote items for a start date and a party; the date may be unknown (then no rate line can be priced). */
export async function tierItems(
  tx: OrgTx,
  lines: readonly TierLine[],
  context: { startDate: string | null; travellers: number; nights: number },
): Promise<QuoteItem[]> {
  const items: QuoteItem[] = [];
  for (const line of lines) {
    const quantity = quantityFor(line.quantityRule, line.quantity, context);
    const priced =
      line.rateId !== null && context.startDate !== null
        ? await pricedLineOn(tx, { rateId: line.rateId, date: context.startDate, quantity })
        : null;
    if (priced !== null) {
      items.push({
        ...itemOf(priced),
        description: line.description,
        detail: line.detail !== "" ? line.detail : priced.detail,
      });
    } else if (line.rateId === null && line.unitPricePaise > 0) {
      items.push({ description: line.description, detail: line.detail, quantity, unitPricePaise: line.unitPricePaise });
    } else {
      items.push({
        description: line.description,
        detail: line.detail,
        quantity,
        unitPricePaise: 0,
        needsRate: true,
      });
    }
  }
  return items;
}

const subtotalOf = (items: readonly QuoteItem[]) =>
  items.reduce((total, item) => total + item.unitPricePaise * item.quantity, 0);

/** A new draft quote for each tier chosen (or one for a package with no tiers), as options of the lead's enquiry. */
export async function makeQuotesFromPackage(
  tx: OrgTx,
  access: MemberAccess,
  input: MakeQuotesFromPackageInput,
  context: QuoteContext,
): Promise<MadeQuotes> {
  const lead = await getLead(tx, access, input.leadId);
  const row = await findPackage(tx, input.packageId);
  const tiers = await tiersOf(tx, row.id);
  let chosen: (PackageTier | null)[];
  if (tiers.length === 0) {
    chosen = [null];
  } else {
    chosen = input.tierIds.map((id) => {
      const tier = tiers.find((candidate) => candidate.id === id);
      if (tier === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such tier");
      return tier;
    });
    if (chosen.length === 0) throw new DomainError("VALIDATION", "PACKAGE_TIER_REQUIRED", "Choose at least one tier");
  }
  const days = daysOf(row);
  const startDate = input.startDate ?? (lead.trip.when.kind === "dates" ? lead.trip.when.from : null);
  const adults = lead.trip.adults ?? 2;
  const children = lead.trip.childrenAges.length;
  const nights = row.nights ?? Math.max(0, days.length - 1);
  const notes = [row.notes, row.cancellationNotes === "" ? "" : `Cancellation: ${row.cancellationNotes}`]
    .filter((part) => part !== "")
    .join("\n\n")
    .slice(0, 3000);
  const made: MadeQuotes["quotes"] = [];
  for (const tier of chosen) {
    const items =
      tier === null
        ? itemsOf(row)
        : await tierItems(tx, tier.lines, { startDate, travellers: adults + children, nights });
    const quote = await createQuote(
      tx,
      access,
      {
        leadId: lead.id,
        title: (tier === null ? row.title : `${row.title} (${tier.name})`).slice(0, 120),
        startDate,
        adults,
        children,
        days,
        items,
        inclusions: row.inclusions,
        exclusions: row.exclusions,
        notes,
        taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
        placeOfSupply: null,
      },
      context,
      true,
    );
    await tx.quote.update({ where: { id: quote.id }, data: { templateId: row.id } });
    made.push({ id: quote.id, title: quote.title, needsRateLines: quote.needsRateLines });
  }
  return { quotes: made };
}

/**
 * "From ₹X per person", suggested: the cheapest tier priced for two adults on the first day, from today, on which some tier
 * prices completely (today, or the start of a season of a supplier the tiers use). Null when no tier prices. Staff accept it
 * or not; it is never refreshed on its own.
 */
export async function calculateFromPrice(
  tx: OrgTx,
  packageId: string,
  today: CalendarDate,
): Promise<CalculatedFromPrice> {
  const row = await findPackage(tx, packageId);
  const tiers = (await tiersOf(tx, row.id)).filter((tier) => tier.lines.length > 0);
  const none = { fromPricePaise: null, tierName: null, forDate: null };
  if (tiers.length === 0) return none;
  const rateIds = [
    ...new Set(tiers.flatMap((tier) => tier.lines.flatMap((line) => (line.rateId === null ? [] : [line.rateId])))),
  ];
  const suppliers = [
    ...new Set(
      (
        await tx.supplierRate.findMany({
          where: { id: { in: rateIds } },
          select: { season: { select: { supplierId: true } } },
        })
      ).map((rate) => rate.season.supplierId),
    ),
  ];
  const seasonStarts = (
    await tx.supplierRateSeason.findMany({
      where: { supplierId: { in: suppliers }, endsOn: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { startsOn: "asc" },
      select: { startsOn: true },
    })
  ).map((season) => season.startsOn.toISOString().slice(0, 10));
  const nights = row.nights ?? Math.max(0, daysOf(row).length - 1);
  const dates = [...new Set([today, ...seasonStarts.filter((start) => start > today)])].sort();
  for (const date of dates) {
    let best: { name: string; totalPaise: number } | null = null;
    for (const tier of tiers) {
      const items = await tierItems(tx, tier.lines, { startDate: date, travellers: 2, nights });
      if (items.some((item) => item.needsRate === true)) continue;
      const totalPaise = subtotalOf(items);
      if (best === null || totalPaise < best.totalPaise) best = { name: tier.name, totalPaise };
    }
    if (best !== null) {
      // Per person, rounded up to a whole rupee.
      const perPerson = Math.ceil(best.totalPaise / 2 / 100) * 100;
      return { fromPricePaise: perPerson, tierName: best.name, forDate: date };
    }
  }
  return none;
}
