// How many suggestions an agency has made this month, against its limit (a named constant). The count is one row a month,
// raised in a single statement that refuses to pass the limit, so two members asking at once never go over it.
import type { OrgTx } from "@travel-crm/db";
import { monthStartOf } from "../inbox/index.js";

/** Suggestions an agency may make in a month, whatever its plan. */
export const MONTHLY_SUGGESTION_LIMIT = 500;

/** Takes one of this month's suggestions; false when none is left. */
export async function reserveSuggestion(tx: OrgTx, now: Date, timeZone: string): Promise<boolean> {
  const month = monthStartOf(now, timeZone);
  const rows = await tx.$queryRaw<{ suggestions: number }[]>`
    INSERT INTO ai_usage (id, month, suggestions)
    VALUES (gen_random_uuid(), ${month}::date, 1)
    ON CONFLICT (organization_id, month)
    DO UPDATE SET suggestions = ai_usage.suggestions + 1 WHERE ai_usage.suggestions < ${MONTHLY_SUGGESTION_LIMIT}
    RETURNING suggestions`;
  return rows.length > 0;
}

/** Gives one back: the AI didn't answer, so it wasn't a suggestion. */
export async function releaseSuggestion(tx: OrgTx, now: Date, timeZone: string): Promise<void> {
  const month = monthStartOf(now, timeZone);
  await tx.aiUsage.updateMany({ where: { month, suggestions: { gt: 0 } }, data: { suggestions: { decrement: 1 } } });
}

export async function usedThisMonth(tx: OrgTx, now: Date, timeZone: string): Promise<number> {
  const row = await tx.aiUsage.findFirst({
    where: { month: monthStartOf(now, timeZone) },
    select: { suggestions: true },
  });
  return row?.suggestions ?? 0;
}
