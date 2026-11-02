// The console's AI usage (the owner, 2026-11-02), from the log of every call (ai_call): today's and this month's calls,
// tokens and cost (and the month's at this pace), the last 30 days day by day, by feature and by model, and each
// agency's state (ai-states.ts). Days and months are India's, as the console's other figures. Costs come from the
// models' published prices (ai-pricing.ts); a model with none counts nothing and says so.
import type { AiFigures, AiOverview } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import { MONTHLY_AI_LIMIT } from "../ai/index.js";
import { addDays, calendarDateIn, parseCalendarDate, startOfDayIn } from "../kernel/index.js";
import { aiPricing } from "./ai-pricing.js";
import { aiStatesOf } from "./ai-states.js";
import type { PlatformServices } from "./services.js";

const ZONE = "Asia/Kolkata";
const DEFAULT_USD_INR_RATE = 96;
const FAILED = new Set(["rate_limited", "unavailable"]);

export interface CallGroup {
  organizationId: string;
  feature: string;
  model: string;
  outcome: string;
  day: string;
  calls: number;
  input: number;
  output: number;
}

/** The calls since a moment, counted by agency, feature, model, outcome and India day. */
function callGroups(tx: PlatformTx, since: Date): Promise<CallGroup[]> {
  return tx.$queryRaw<CallGroup[]>`
    SELECT organization_id AS "organizationId", feature, model, outcome,
      to_char((occurred_at AT TIME ZONE ${ZONE})::date, 'YYYY-MM-DD') AS day,
      count(*)::int AS calls,
      COALESCE(sum(input_tokens), 0)::float8 AS input,
      COALESCE(sum(output_tokens), 0)::float8 AS output
    FROM ai_call WHERE occurred_at >= ${since}
    GROUP BY 1, 2, 3, 4, 5`;
}

const empty = (): AiFigures => ({ calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costPaise: 0 });

function add(figures: AiFigures, group: CallGroup, cost: number | null): void {
  figures.calls += group.calls;
  if (FAILED.has(group.outcome)) figures.failed += group.calls;
  figures.inputTokens += group.input;
  figures.outputTokens += group.output;
  figures.costPaise += cost ?? 0;
}

export async function aiOverviewOf(services: PlatformServices, now: Date = new Date()): Promise<AiOverview> {
  const pricing = aiPricing(services.usdInrRate ?? DEFAULT_USD_INR_RATE, services.aiPrices ?? null);
  const today = calendarDateIn(now, ZONE);
  const monthStartDay = parseCalendarDate(`${today.slice(0, 7)}-01`);
  const firstDay = addDays(today, -29);
  const since = startOfDayIn(monthStartDay < firstDay ? monthStartDay : firstDay, ZONE);
  const groups = await services.platformDb.transaction((tx) => callGroups(tx, since));

  const todays = empty();
  const month = empty();
  const days = new Map<string, { calls: number; failed: number; costPaise: number }>();
  for (let offset = 0; offset < 30; offset++)
    days.set(addDays(firstDay, offset), { calls: 0, failed: 0, costPaise: 0 });
  const features = new Map<string, AiFigures>();
  const models = new Map<string, AiFigures & { priced: boolean }>();
  const byOrganization = new Map<string, { month: AiFigures; failedToday: number }>();

  for (const group of groups) {
    const cost = pricing.costPaise(group.model, group.day, { input: group.input, output: group.output });
    const day = days.get(group.day);
    if (day !== undefined) {
      day.calls += group.calls;
      if (FAILED.has(group.outcome)) day.failed += group.calls;
      day.costPaise += cost ?? 0;
    }
    if (group.day === today) add(todays, group, cost);
    if (group.day < monthStartDay) continue;
    add(month, group, cost);
    const feature = features.get(group.feature) ?? empty();
    add(feature, group, cost);
    features.set(group.feature, feature);
    if (group.model !== "") {
      const model = models.get(group.model) ?? { ...empty(), priced: cost !== null };
      add(model, group, cost);
      models.set(group.model, model);
    }
    const organization = byOrganization.get(group.organizationId) ?? { month: empty(), failedToday: 0 };
    add(organization.month, group, cost);
    if (group.day === today && FAILED.has(group.outcome)) organization.failedToday += group.calls;
    byOrganization.set(group.organizationId, organization);
  }

  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const elapsedDays = Math.max(1, (now.getTime() - startOfDayIn(monthStartDay, ZONE).getTime()) / 86_400_000);
  return {
    usdInrRate: pricing.usdInrRate,
    monthlyCallLimit: MONTHLY_AI_LIMIT,
    prices: pricing.table(today),
    today: todays,
    thisMonth: { ...month, projectedPaise: Math.round((month.costPaise / elapsedDays) * daysInMonth) },
    days: [...days].map(([day, figures]) => ({ day, ...figures })),
    byFeature: [...features].map(([feature, figures]) => ({ feature, ...figures })).sort((a, b) => b.calls - a.calls),
    byModel: [...models].map(([model, figures]) => ({ model, ...figures })).sort((a, b) => b.calls - a.calls),
    organizations: await aiStatesOf(services, byOrganization, now),
  };
}
