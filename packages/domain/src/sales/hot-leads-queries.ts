// Two of the hot lead rule's reads as composable SQL (R11: the performance tests EXPLAIN exactly what runs), each one
// query with no cap, so Show: Hot holds every hot lead: open leads in scope travelling within the agency's days, and
// those whose budget for everyone is at or over its mark. The open stages are written out as the partial indexes'
// predicate holds them (as crm's list does), so lead_open and lead_open_by_owner serve them.
import { emptySql, sql, type Sql } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";

/** Live open leads in the member's scope; one lead alone when `only` names it (a lead page's heat). */
function openLeadsInScope(access: MemberAccess, only: string | undefined): Sql {
  const owner = scopeFilter(access, "leads:view", "ownerUserId").ownerUserId;
  return sql`deleted_at IS NULL AND stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested'])
    ${owner === undefined ? emptySql : sql`AND owner_user_id = ${owner}::uuid`}
    ${only === undefined ? emptySql : sql`AND id = ${only}::uuid`}`;
}

/** Those travelling on dates that start from `from` to `to`, both days included (yyyy-mm-dd). */
export function travelSoonQuery(access: MemberAccess, window: { from: string; to: string }, only?: string): Sql {
  return sql`
    SELECT id FROM lead
    WHERE ${openLeadsInScope(access, only)}
      AND travel_kind = 'dates' AND travel_start BETWEEN ${window.from}::date AND ${window.to}::date`;
}

/** Those whose budget for everyone is at or over the mark: a per-person budget once for each of the party, at least one. */
export function bigBudgetQuery(access: MemberAccess, mark: number, only?: string): Sql {
  return sql`
    SELECT id FROM lead
    WHERE ${openLeadsInScope(access, only)} AND budget_paise IS NOT NULL
      AND budget_paise * CASE WHEN budget_basis = 'per_person'
        THEN GREATEST(1, COALESCE(adults, 0) + cardinality(children_ages)) ELSE 1 END >= ${mark}::bigint`;
}
