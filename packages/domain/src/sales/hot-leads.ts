// The hot leads to call now (sales execution): open leads the member may see that opened their quote or asked to book in
// the last seven days, that travel within the agency's days, or whose budget for everyone is at or over its mark. Each
// gets a score from its reasons (a quote opened again counts more), hottest first: 25 at most for Home, every one of
// them for the Leads list's Show: Hot (leads show spec, 2026-11-21).
import { openLeadStages } from "@travel-crm/contracts/crm";
import { hotLeadList, type HotLead, type HotReason, type SalesAutomation } from "@travel-crm/contracts/sales";
import type { OrgTx } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { addDays, parseCalendarDate } from "../kernel/index.js";
import { bigBudgetQuery, travelSoonQuery } from "./hot-leads-queries.js";

const WEEK = 7 * 24 * 3_600_000;
const weights: Record<HotReason, number> = { quote_opened: 40, asked_price: 30, travel_soon: 20, big_budget: 10 };

interface Heat {
  score: number;
  reasons: Set<HotReason>;
  lastSignalAt: Date | null;
}

/** Every open lead in scope with a reason to be hot, and how hot. */
async function heatOf(
  tx: OrgTx,
  access: MemberAccess,
  settings: SalesAutomation,
  now: Date,
  today: string,
  only?: string,
): Promise<Map<string, Heat>> {
  const open = { stage: { in: [...openLeadStages] }, ...scopeFilter(access, "leads:view", "ownerUserId") };
  const lead = only === undefined ? open : { ...open, id: only };
  const heat = new Map<string, Heat>();
  const add = (leadId: string, reason: HotReason, at: Date | null = null, extra = 0) => {
    const entry = heat.get(leadId) ?? { score: 0, reasons: new Set<HotReason>(), lastSignalAt: null };
    entry.score += (entry.reasons.has(reason) ? 0 : weights[reason]) + extra;
    entry.reasons.add(reason);
    if (at !== null && (entry.lastSignalAt === null || at > entry.lastSignalAt)) entry.lastSignalAt = at;
    heat.set(leadId, entry);
  };
  const signals = await tx.leadSignal.findMany({
    where: { at: { gte: new Date(now.getTime() - WEEK) }, lead },
    select: { leadId: true, kind: true, at: true },
  });
  for (const signal of signals) {
    // Each open after the first adds a little more: they keep coming back to it.
    const reason = signal.kind === "quote_opened" ? "quote_opened" : "asked_price";
    add(signal.leadId, reason, signal.at, heat.get(signal.leadId)?.reasons.has(reason) === true ? 5 : 0);
  }
  if (settings.hotTravelDays > 0) {
    const window = { from: today, to: addDays(parseCalendarDate(today), settings.hotTravelDays) };
    const soon = await tx.$queryRaw<{ id: string }[]>(travelSoonQuery(access, window, only));
    for (const row of soon) add(row.id, "travel_soon");
  }
  if (settings.hotBudgetPaise !== null) {
    const big = await tx.$queryRaw<{ id: string }[]>(bigBudgetQuery(access, settings.hotBudgetPaise, only));
    for (const row of big) add(row.id, "big_budget");
  }
  return heat;
}

const reasonOrder = Object.keys(weights) as HotReason[];

/** Every hot lead in scope, hottest first: by score, then the latest signal, then the newest lead, so pages hold still. */
async function rankedHeat(
  tx: OrgTx,
  access: MemberAccess,
  settings: SalesAutomation,
  context: { now: Date; today: string },
): Promise<[string, Heat][]> {
  const heat = await heatOf(tx, access, settings, context.now, context.today);
  return [...heat.entries()].sort(
    ([aId, a], [bId, b]) =>
      b.score - a.score ||
      (b.lastSignalAt?.getTime() ?? 0) - (a.lastSignalAt?.getTime() ?? 0) ||
      (aId < bId ? 1 : aId > bId ? -1 : 0),
  );
}

/** Every hot lead's id in scope, hottest first: the Leads list's Show: Hot, which pages through all of them. */
export async function hotLeadIds(
  tx: OrgTx,
  access: MemberAccess,
  settings: SalesAutomation,
  context: { now: Date; today: string },
): Promise<string[]> {
  return (await rankedHeat(tx, access, settings, context)).map(([leadId]) => leadId);
}

/** The 25 hottest, each with its person, trip and reasons, for Home. */
export async function hotLeadsOf(
  tx: OrgTx,
  access: MemberAccess,
  settings: SalesAutomation,
  context: { now: Date; today: string },
): Promise<HotLead[]> {
  const top = (await rankedHeat(tx, access, settings, context)).slice(0, 25);
  if (top.length === 0) return [];
  const leads = await tx.lead.findMany({
    where: { id: { in: top.map(([leadId]) => leadId) } },
    select: {
      id: true,
      stage: true,
      ownerUserId: true,
      travelKind: true,
      travelStart: true,
      destinationId: true,
      person: { select: { name: true, phoneE164: true } },
    },
  });
  const destinationIds = [...new Set(leads.flatMap((row) => (row.destinationId === null ? [] : [row.destinationId])))];
  const destinations = new Map(
    (await tx.destination.findMany({ where: { id: { in: destinationIds } }, select: { id: true, name: true } })).map(
      (row) => [row.id, row.name],
    ),
  );
  const byId = new Map(leads.map((row) => [row.id, row]));
  return hotLeadList.parse(
    top.flatMap(([leadId, entry]) => {
      const row = byId.get(leadId);
      if (row === undefined) return [];
      return [
        {
          leadId,
          name: row.person.name,
          phone: row.person.phoneE164,
          stage: row.stage,
          ownerUserId: row.ownerUserId,
          destination: row.destinationId === null ? null : (destinations.get(row.destinationId) ?? null),
          startDate:
            row.travelKind === "dates" && row.travelStart !== null ? row.travelStart.toISOString().slice(0, 10) : null,
          score: entry.score,
          reasons: reasonOrder.filter((reason) => entry.reasons.has(reason)),
          lastSignalAt: entry.lastSignalAt?.toISOString() ?? null,
        },
      ];
    }),
  );
}

/** One lead's heat, for its page: its score and reasons (none when it isn't hot). */
export async function leadHeatOf(
  tx: OrgTx,
  access: MemberAccess,
  settings: SalesAutomation,
  context: { now: Date; today: string; leadId: string },
): Promise<{ score: number; reasons: HotReason[] }> {
  const entry = (await heatOf(tx, access, settings, context.now, context.today, context.leadId)).get(context.leadId);
  return { score: entry?.score ?? 0, reasons: reasonOrder.filter((reason) => entry?.reasons.has(reason) === true) };
}
