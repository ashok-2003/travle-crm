// Each agency's AI as the console sees it (the owner, 2026-11-02): working, or why not and since when. In order: its plan
// has no AI, or its subscription is read-only, suspended or cancelled; the agency switched it off; the month's calls are
// used up; its last calls failed (rate limited or down) with no answer since; it has never been called; else working.
// Each agency's settings and plan are read in a short transaction of its own, stepping into it, as the dashboard does.
import type { AiCallOutcome, AiFigures, AiOrganizationUsage } from "@travel-crm/contracts/platform";
import { aiCallOutcome } from "@travel-crm/contracts/platform";
import { asOrganization } from "@travel-crm/db/platform";
import { MONTHLY_AI_LIMIT } from "../ai/index.js";
import { listOrganizationRecords } from "../identity/index.js";
import { entitlementsOf } from "../subscriptions/index.js";
import type { PlatformServices } from "./services.js";

/** A failure older than this, with nothing since, no longer counts as failing now. */
const FAILING_WINDOW_MS = 2 * 60 * 60_000;
const BLOCKED = new Set(["read_only", "suspended", "cancelled"]);

interface LastCalls {
  organizationId: string;
  lastCall: Date | null;
  lastOk: Date | null;
  lastOutcome: string | null;
  failingSince: Date | null;
}

const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const zero: AiFigures = { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costPaise: 0 };

export async function aiStatesOf(
  services: PlatformServices,
  usage: ReadonlyMap<string, { month: AiFigures; failedToday: number }>,
  now: Date,
): Promise<AiOrganizationUsage[]> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const { organizations, last } = await services.platformDb.transaction(async (tx) => ({
    organizations: await listOrganizationRecords(tx, { limit: 500 }),
    last: await tx.$queryRaw<LastCalls[]>`
      WITH latest AS (
        SELECT organization_id, max(occurred_at) AS last_call,
          max(occurred_at) FILTER (WHERE outcome = 'ok') AS last_ok
        FROM ai_call WHERE occurred_at >= ${since} GROUP BY organization_id
      )
      SELECT l.organization_id AS "organizationId", l.last_call AS "lastCall", l.last_ok AS "lastOk",
        (SELECT c.outcome FROM ai_call c WHERE c.organization_id = l.organization_id
          ORDER BY c.occurred_at DESC LIMIT 1) AS "lastOutcome",
        (SELECT min(c.occurred_at) FROM ai_call c WHERE c.organization_id = l.organization_id
          AND c.outcome IN ('rate_limited', 'unavailable') AND c.occurred_at > COALESCE(l.last_ok, ${since})) AS "failingSince"
      FROM latest l`,
  }));
  const lastBy = new Map(last.map((row) => [row.organizationId, row]));
  const states: AiOrganizationUsage[] = [];
  for (const organization of organizations) {
    const facts = await services.platformDb.transaction((tx) =>
      asOrganization(tx, organization.id, async (orgTx) => ({
        entitlements: await entitlementsOf(orgTx, organization.id, now),
        settings: await orgTx.aiSettings.findFirst({ select: { enabled: true, updatedAt: true } }),
        usage: await orgTx.aiUsage.findFirst({ orderBy: { month: "desc" }, select: { month: true, calls: true } }),
      })),
    );
    const calls = lastBy.get(organization.id);
    const figures = usage.get(organization.id);
    // The month row of the agency's own month: one older than 32 days is last month's.
    const callsThisMonth =
      facts.usage !== null && now.getTime() - facts.usage.month.getTime() < 32 * 86_400_000 ? facts.usage.calls : 0;
    const lastOutcome = calls?.lastOutcome == null ? null : aiCallOutcome.parse(calls.lastOutcome);
    const failing =
      calls?.failingSince != null &&
      (lastOutcome === "rate_limited" || lastOutcome === "unavailable") &&
      now.getTime() - (calls.lastCall?.getTime() ?? 0) < FAILING_WINDOW_MS;
    let state: AiOrganizationUsage["state"] = "working";
    let since: string | null = iso(calls?.lastOk);
    let failingReason: AiCallOutcome | null = null;
    if (!facts.entitlements?.modules.has("ai")) {
      state = "not_on_plan";
      since = null;
    } else if (BLOCKED.has(facts.entitlements.status)) {
      state = "subscription_blocked";
      since = null;
    } else if (facts.settings?.enabled !== true) {
      state = "off";
      since = iso(facts.settings?.updatedAt);
    } else if (callsThisMonth >= MONTHLY_AI_LIMIT) {
      state = "limit_reached";
      since = null;
    } else if (failing) {
      state = "failing";
      since = iso(calls.failingSince);
      failingReason = lastOutcome;
    } else if (calls === undefined) {
      state = "unused";
      since = null;
    }
    states.push({
      organizationId: organization.id,
      name: organization.name,
      code: organization.code,
      state,
      failingReason,
      since,
      callsThisMonth,
      limit: MONTHLY_AI_LIMIT,
      thisMonth: figures?.month ?? zero,
      failedToday: figures?.failedToday ?? 0,
      lastCallAt: iso(calls?.lastCall),
      lastOkAt: iso(calls?.lastOk),
    });
  }
  // What needs a look first: failing, then out of calls, then the rest by this month's calls.
  const rank = { failing: 0, limit_reached: 1, subscription_blocked: 2, off: 3, not_on_plan: 4, working: 5, unused: 6 };
  return states.sort((a, b) => rank[a.state] - rank[b.state] || b.callsThisMonth - a.callsThisMonth);
}
