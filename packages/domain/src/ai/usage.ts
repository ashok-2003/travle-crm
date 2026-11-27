// How many AI credits (one per AI call) an agency has used this month, against its plan's limit: every AI feature (a
// suggested reply, a lead's score) shares it. The count is one row a month, raised in a single statement that refuses
// to pass the limit, so two members asking at once never go over it.
import type { OrgTx } from "@travel-crm/db";
import { monthStartOf } from "../inbox/index.js";

/**
 * The AI credits a month (one per AI call) an agency has without a plan to say otherwise, and what every plan made
 * before plans carried their own has (the owner: 8,000 on 2026-11-06, 10,000 on 2026-11-22).
 */
export const MONTHLY_AI_LIMIT = 10_000;

/**
 * The credits a month the organization's plan gives, shared by every AI feature and the autopilot; an organization
 * without a subscription keeps the default. Read in the transaction that spends or shows them, so a plan change counts
 * at once.
 */
export async function monthlyAiLimitOf(tx: OrgTx): Promise<number> {
  const row = await tx.subscription.findFirst({ select: { plan: { select: { aiCreditsPerMonth: true } } } });
  return row?.plan.aiCreditsPerMonth ?? MONTHLY_AI_LIMIT;
}

/** Takes one of this month's calls; false when none is left. */
export async function reserveAiCall(tx: OrgTx, now: Date, timeZone: string): Promise<boolean> {
  const month = monthStartOf(now, timeZone);
  const limit = await monthlyAiLimitOf(tx);
  const rows = await tx.$queryRaw<{ calls: number }[]>`
    INSERT INTO ai_usage (id, month, calls)
    VALUES (gen_random_uuid(), ${month}::date, 1)
    ON CONFLICT (organization_id, month)
    DO UPDATE SET calls = ai_usage.calls + 1 WHERE ai_usage.calls < ${limit}
    RETURNING calls`;
  return rows.length > 0;
}

/** Gives one back: the AI didn't answer, so it wasn't a call. */
export async function releaseAiCall(tx: OrgTx, now: Date, timeZone: string): Promise<void> {
  const month = monthStartOf(now, timeZone);
  await tx.aiUsage.updateMany({ where: { month, calls: { gt: 0 } }, data: { calls: { decrement: 1 } } });
}

export async function usedThisMonth(tx: OrgTx, now: Date, timeZone: string): Promise<number> {
  const row = await tx.aiUsage.findFirst({ where: { month: monthStartOf(now, timeZone) }, select: { calls: true } });
  return row?.calls ?? 0;
}

/** Adds the tokens a call used to this month's row, for the console's cost figures. */
export async function recordTokens(
  tx: OrgTx,
  now: Date,
  timeZone: string,
  tokens: { input: number; output: number },
): Promise<void> {
  await tx.aiUsage.updateMany({
    where: { month: monthStartOf(now, timeZone) },
    data: { inputTokens: { increment: tokens.input }, outputTokens: { increment: tokens.output } },
  });
}
