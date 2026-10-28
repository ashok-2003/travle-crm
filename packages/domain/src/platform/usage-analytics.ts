// How organizations use the product, for the platform console (the owner, 2026-10-28): from their page visits, each
// organization's time in the product (7 and 30 days), its sessions (a member's visits with no more than half an hour
// between them), when it was last used, its members and leads, and what its AI cost this month and will at this pace;
// for one organization, its pages, its members, its last fortnight day by day, and its sessions. The platform role
// sees every organization, so each query names the organization it counts.
import type { OrganizationUsage, UsageOverview } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import type { PlatformServices } from "./services.js";

const DAY_MS = 86_400_000;

/** What one million tokens cost, in paise, as the console's settings give it (AI_PRICE_*). */
export interface AiPrices {
  inputPaisePerMillion: number;
  outputPaisePerMillion: number;
}

/** This month's cost so far, and at this pace by the month's end (UTC months). */
function aiCost(prices: AiPrices | null, tokens: { input: number; output: number }, now: Date) {
  if (prices === null) return { costPaise: 0, projectedPaise: 0 };
  const costPaise = Math.round(
    (tokens.input * prices.inputPaisePerMillion + tokens.output * prices.outputPaisePerMillion) / 1_000_000,
  );
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = Math.max(1, (now.getTime() - monthStart) / DAY_MS);
  return { costPaise, projectedPaise: Math.round((costPaise / elapsedDays) * daysInMonth) };
}

const monthStartOf = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

interface VisitTotals {
  organization_id: string;
  seconds7d: number;
  seconds30d: number;
  sessions30d: number;
  last_active: Date | null;
}

async function visitTotals(tx: PlatformTx, now: Date): Promise<Map<string, VisitTotals>> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await tx.$queryRaw<VisitTotals[]>`
    WITH v AS (
      SELECT organization_id, started_at, seconds,
        LAG(started_at + make_interval(secs => seconds))
          OVER (PARTITION BY organization_id, user_id ORDER BY started_at) AS previous_end
      FROM page_visit WHERE started_at > ${since30}
    )
    SELECT organization_id,
      COALESCE(SUM(seconds) FILTER (WHERE started_at > ${since7}), 0)::int AS seconds7d,
      COALESCE(SUM(seconds), 0)::int AS seconds30d,
      COUNT(*) FILTER (WHERE previous_end IS NULL OR started_at - previous_end > interval '30 minutes')::int AS sessions30d,
      MAX(started_at + make_interval(secs => seconds)) AS last_active
    FROM v GROUP BY organization_id`;
  return new Map(rows.map((row) => [row.organization_id, row]));
}

export async function usageOverviewOf(
  services: PlatformServices,
  prices: AiPrices | null,
  now: Date = new Date(),
): Promise<UsageOverview> {
  return services.platformDb.transaction(async (tx) => {
    const organizations = await tx.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, code: true, createdAt: true },
    });
    const visits = await visitTotals(tx, now);
    const members = await tx.member.groupBy({ by: ["organizationId"], _count: { _all: true } });
    const leads = await tx.lead.groupBy({ by: ["organizationId"], _count: { _all: true } });
    const vips = new Set(
      (await tx.organizationWelcome.findMany({ where: { vip: true }, select: { organizationId: true } })).map(
        (one) => one.organizationId,
      ),
    );
    const count = (rows: { organizationId: string; _count: { _all: number } }[], id: string) =>
      rows.find((row) => row.organizationId === id)?._count._all ?? 0;
    const items = organizations.map((organization) => {
      const visit = visits.get(organization.id);
      // Our AI counts calls, not tokens (ai_usage), so no price can be applied: the cost shows as 0 until it counts tokens.
      const cost = aiCost(prices, { input: 0, output: 0 }, now);
      return {
        organizationId: organization.id,
        name: organization.name,
        code: organization.code,
        createdAt: organization.createdAt.toISOString(),
        vip: vips.has(organization.id),
        members: count(members, organization.id),
        leads: count(leads, organization.id),
        lastActiveAt: visit?.last_active?.toISOString() ?? null,
        seconds7d: visit?.seconds7d ?? 0,
        seconds30d: visit?.seconds30d ?? 0,
        sessions30d: visit?.sessions30d ?? 0,
        aiCostPaise: cost.costPaise,
        aiProjectedPaise: cost.projectedPaise,
      };
    });
    const activeSince = (ms: number) =>
      items.filter((item) => item.lastActiveAt !== null && now.getTime() - Date.parse(item.lastActiveAt) < ms).length;
    return {
      items,
      totals: {
        organizations: items.length,
        activeToday: activeSince(DAY_MS),
        active7d: activeSince(7 * DAY_MS),
        seconds7d: items.reduce((sum, item) => sum + item.seconds7d, 0),
        aiCostPaise: items.reduce((sum, item) => sum + item.aiCostPaise, 0),
        aiProjectedPaise: items.reduce((sum, item) => sum + item.aiProjectedPaise, 0),
      },
      aiPriced: prices !== null,
    };
  });
}

interface SessionRow {
  user_id: string;
  started_at: Date;
  seconds: number;
}

export async function organizationUsageOf(
  services: PlatformServices,
  prices: AiPrices | null,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationUsage> {
  return services.platformDb.transaction(async (tx) => {
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since14 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 13 * DAY_MS);
    const pages = await tx.pageVisit.groupBy({
      by: ["path"],
      where: { organizationId, startedAt: { gt: since30 } },
      _count: { _all: true },
      _sum: { seconds: true },
      orderBy: { _sum: { seconds: "desc" } },
      take: 30,
    });
    const people = await tx.member.findMany({
      where: { organizationId },
      select: { userId: true, user: { select: { name: true } } },
    });
    const names = new Map(people.map((person) => [person.userId, person.user.name]));
    // Each session: a member's visits with at most half an hour between one's end and the next one's start.
    const sessions = await tx.$queryRaw<SessionRow[]>`
      WITH v AS (
        SELECT user_id, started_at, seconds,
          LAG(started_at + make_interval(secs => seconds)) OVER (PARTITION BY user_id ORDER BY started_at) AS previous_end
        FROM page_visit WHERE organization_id = ${organizationId}::uuid AND started_at > ${since30}
      ), marked AS (
        SELECT *, SUM(CASE WHEN previous_end IS NULL OR started_at - previous_end > interval '30 minutes' THEN 1 ELSE 0 END)
          OVER (PARTITION BY user_id ORDER BY started_at) AS session
        FROM v
      )
      SELECT user_id, MIN(started_at) AS started_at, SUM(seconds)::int AS seconds
      FROM marked GROUP BY user_id, session ORDER BY MIN(started_at) DESC`;
    const days = await tx.$queryRaw<{ day: string; people: number; seconds: number }[]>`
      SELECT to_char(date_trunc('day', started_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        COUNT(DISTINCT user_id)::int AS people, COALESCE(SUM(seconds), 0)::int AS seconds
      FROM page_visit WHERE organization_id = ${organizationId}::uuid AND started_at >= ${since14}
      GROUP BY 1 ORDER BY 1`;
    const byDay = new Map(days.map((day) => [day.day, day]));
    const fortnight = Array.from({ length: 14 }, (_, index) => {
      const day = new Date(since14.getTime() + index * DAY_MS).toISOString().slice(0, 10);
      return { day, people: byDay.get(day)?.people ?? 0, seconds: byDay.get(day)?.seconds ?? 0 };
    });
    const members = people.map((person) => {
      const theirs = sessions.filter((session) => session.user_id === person.userId);
      const last = theirs[0];
      return {
        userId: person.userId,
        name: person.user.name,
        lastActiveAt:
          last === undefined ? null : new Date(last.started_at.getTime() + last.seconds * 1000).toISOString(),
        seconds30d: theirs.reduce((sum, session) => sum + session.seconds, 0),
        sessions30d: theirs.length,
      };
    });
    // The month's row starts on the agency's own first day, which can be a day before the UTC month's.
    const ai = await tx.aiUsage.aggregate({
      where: { organizationId, month: { gte: new Date(monthStartOf(now).getTime() - DAY_MS) } },
      _sum: { calls: true },
    });
    const tokens = { input: 0, output: 0 };
    return {
      pages: pages.map((page) => ({ path: page.path, visits: page._count._all, seconds: page._sum.seconds ?? 0 })),
      members: members.sort((a, b) => b.seconds30d - a.seconds30d),
      days: fortnight,
      sessions: sessions.slice(0, 50).map((session) => ({
        userId: session.user_id,
        name: names.get(session.user_id) ?? "",
        startedAt: session.started_at.toISOString(),
        seconds: session.seconds,
      })),
      ai: {
        calls: ai._sum.calls ?? 0,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        ...aiCost(prices, tokens, now),
      },
    };
  });
}
