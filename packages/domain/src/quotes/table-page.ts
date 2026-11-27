// The Quotes table (bookings revamp, 2026-11-27): one numbered page of the member's quotes (or the agency's), searched,
// filtered and sorted in Postgres, with how many match across every page. The search takes the customer's name or the
// trip's title in any case (LIKE's wildcards are letters), or a phone's digits (phoneSearchDigits). "Money still to come"
// is an accepted quote whose live payments are less than its total, as the list's balance says. Every order ends on the
// id, so a page's rows never move to the next; the travel date puts quotes without one last.
import type { QuoteSummary, QuoteTablePageInput, QuoteTableSort } from "@travel-crm/contracts/quotes";
import { emptySql, likePattern, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { phoneSearchDigits } from "../kernel/index.js";
import { quoteColumns, toSummary } from "./quote-rows.js";

/** A quote as the table lists it: its summary and the lead's owner (its salesperson). */
export type QuoteTableItem = QuoteSummary & { ownerUserId: string | null };

const FROM = sql`FROM quote
  JOIN lead ON lead.organization_id = quote.organization_id AND lead.id = quote.lead_id
  JOIN person ON person.organization_id = lead.organization_id AND person.id = lead.person_id`;

function searchCondition(search: string | undefined): Sql {
  const text = search?.trim() ?? "";
  if (text === "") return emptySql;
  const pattern = likePattern(text);
  const digits = phoneSearchDigits(text);
  return sql`AND (person.name ILIKE ${pattern} OR quote.title ILIKE ${pattern}
    ${digits === null ? emptySql : sql`OR person.phone_e164 LIKE ${`%${digits}%`}`})`;
}

const BALANCE_DUE = sql`AND quote.status = 'accepted' AND quote.total_paise > (
  SELECT coalesce(sum(quote_payment.amount_paise), 0) FROM quote_payment
  WHERE quote_payment.organization_id = quote.organization_id AND quote_payment.quote_id = quote.id
    AND quote_payment.voided_at IS NULL)`;

/** Whose quotes and which: an own-scope member's own (the salesperson filter is then ignored), then the filters. */
function conditions(access: MemberAccess, input: QuoteTablePageInput): Sql {
  const owner = scopeFilter(access, "quotes:view", "ownerUserId").ownerUserId ?? input.ownerUserId;
  return sql`WHERE quote.deleted_at IS NULL
    ${owner === undefined ? emptySql : sql`AND lead.owner_user_id = ${owner}::uuid`}
    ${input.status === undefined ? emptySql : sql`AND quote.status = ${input.status}`}
    ${input.balanceDue === true ? BALANCE_DUE : emptySql}
    ${input.travelFrom === undefined ? emptySql : sql`AND quote.start_date >= ${input.travelFrom}::date`}
    ${input.travelTo === undefined ? emptySql : sql`AND quote.start_date <= ${input.travelTo}::date`}
    ${searchCondition(input.search)}`;
}

/** What each sort orders by, then the id in the same direction; a quote without a travel date comes last either way. */
function orderOf(sort: QuoteTableSort, direction: "asc" | "desc"): Sql {
  const way = direction === "asc" ? sql`ASC` : sql`DESC`;
  const by: Record<QuoteTableSort, Sql> = {
    updated: sql`quote.updated_at ${way}`,
    travel: sql`quote.start_date ${way} NULLS LAST`,
    customer: sql`person.name ${way}`,
    total: sql`quote.total_paise ${way}`,
  };
  return sql`ORDER BY ${by[sort]}, quote.id ${way}`;
}

export async function quoteTablePageOf(
  tx: OrgTx,
  access: MemberAccess,
  input: QuoteTablePageInput,
): Promise<{ items: QuoteTableItem[]; total: number }> {
  const where = conditions(access, input);
  const offset = (input.page - 1) * input.limit;
  const [found, counted] = await Promise.all([
    tx.$queryRaw<{ id: string }[]>(
      sql`SELECT quote.id ${FROM} ${where} ${orderOf(input.sort, input.direction)} LIMIT ${input.limit} OFFSET ${offset}`,
    ),
    tx.$queryRaw<{ n: number }[]>(sql`SELECT count(*)::int AS n ${FROM} ${where}`),
  ]);
  const rows = await tx.quote.findMany({ where: { id: { in: found.map((row) => row.id) } }, select: quoteColumns });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    items: found.flatMap(({ id }) => {
      const row = byId.get(id);
      return row === undefined ? [] : [{ ...toSummary(row), ownerUserId: row.lead.ownerUserId }];
    }),
    total: counted[0]?.n ?? 0,
  };
}
