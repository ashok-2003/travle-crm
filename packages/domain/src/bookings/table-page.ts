// The Bookings table (bookings revamp, 2026-11-27): one numbered page of the member's bookings (or the agency's), searched,
// filtered and sorted in Postgres, with how many match across every page. The search takes the customer's name, the trip's
// title or the booking's number in any case, or a phone's digits as typed in any form; LIKE's wildcards are letters.
// Every order ends on the id, so a page's rows never move to the next; the travel date puts trips without one last. The
// payment filter is the payment state's own rule (summaries.ts) run over every booking the other conditions match, which
// at an agency's size is a few thousand at most: the rule then lives in one place, not again in SQL.
import type { BookingTablePageInput, BookingTableSort, BookingSummary } from "@travel-crm/contracts/bookings";
import { emptySql, likePattern, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { calendarDateIn, phoneSearchDigits, type CalendarDate } from "../kernel/index.js";
import { bookingMoneyOf, summariesOf, summaryColumns } from "./summaries.js";

/** A booking as the table lists it: its summary, the trip's travellers and the lead's owner (its salesperson). */
export type BookingTableItem = BookingSummary & { adults: number; children: number; ownerUserId: string | null };

const FROM = sql`FROM booking
  JOIN lead ON lead.organization_id = booking.organization_id AND lead.id = booking.lead_id
  JOIN person ON person.organization_id = lead.organization_id AND person.id = lead.person_id
  JOIN quote ON quote.organization_id = booking.organization_id AND quote.id = booking.quote_id`;

/**
 * A name, title or number anywhere in them; and, for a phone's search (phoneSearchDigits), its digits in the phone. That
 * needs four digits after the leading zeros go: the search is also a booking number's, and "0001" would otherwise look
 * for a 1 in every phone.
 */
function searchCondition(search: string | undefined): Sql {
  const text = search?.trim() ?? "";
  if (text === "") return emptySql;
  const pattern = likePattern(text);
  const digits = phoneSearchDigits(text) ?? "";
  return sql`AND (person.name ILIKE ${pattern} OR quote.title ILIKE ${pattern} OR booking.number ILIKE ${pattern}
    ${digits.length < 4 ? emptySql : sql`OR person.phone_e164 LIKE ${`%${digits}%`}`})`;
}

/** Whose bookings and which: an own-scope member's own (the salesperson filter is then ignored), then the filters. */
function conditions(access: MemberAccess, input: BookingTablePageInput): Sql {
  const owner = scopeFilter(access, "bookings:view", "ownerUserId").ownerUserId ?? input.ownerUserId;
  return sql`WHERE booking.deleted_at IS NULL
    ${owner === undefined ? emptySql : sql`AND lead.owner_user_id = ${owner}::uuid`}
    ${input.status === undefined ? emptySql : sql`AND booking.status = ${input.status}`}
    ${
      input.claimsPending === true
        ? sql`AND EXISTS (SELECT 1 FROM payment_claim WHERE payment_claim.organization_id = booking.organization_id
            AND payment_claim.booking_id = booking.id AND payment_claim.status = 'pending')`
        : emptySql
    }
    ${input.travelFrom === undefined ? emptySql : sql`AND booking.start_date >= ${input.travelFrom}::date`}
    ${input.travelTo === undefined ? emptySql : sql`AND booking.start_date <= ${input.travelTo}::date`}
    ${searchCondition(input.search)}`;
}

/** What each sort orders by, then the id in the same direction; a trip without a travel date comes last either way. */
function orderOf(sort: BookingTableSort, direction: "asc" | "desc"): Sql {
  const way = direction === "asc" ? sql`ASC` : sql`DESC`;
  const by: Record<BookingTableSort, Sql> = {
    travel: sql`booking.start_date ${way} NULLS LAST`,
    customer: sql`person.name ${way}`,
    // What the booking owes, as owedOf says it: a cancelled booking its charge kept.
    total: sql`(CASE WHEN booking.status = 'cancelled' THEN coalesce(booking.charge_paise, 0) ELSE quote.total_paise END) ${way}`,
  };
  return sql`ORDER BY ${by[sort]}, booking.id ${way}`;
}

interface CandidateRow {
  id: string;
  quoteId: string;
  status: string;
  chargePaise: bigint | null;
  totalPaise: bigint;
}

/** The page's ids in order and the total: by the payment rule over every match when a payment state is asked for. */
async function pageIds(
  tx: OrgTx,
  access: MemberAccess,
  input: BookingTablePageInput,
  today: CalendarDate,
): Promise<{ ids: string[]; total: number }> {
  const where = conditions(access, input);
  const order = orderOf(input.sort, input.direction);
  const offset = (input.page - 1) * input.limit;
  if (input.payment === undefined) {
    const [rows, counted] = await Promise.all([
      tx.$queryRaw<{ id: string }[]>(
        sql`SELECT booking.id ${FROM} ${where} ${order} LIMIT ${input.limit} OFFSET ${offset}`,
      ),
      tx.$queryRaw<{ n: number }[]>(sql`SELECT count(*)::int AS n ${FROM} ${where}`),
    ]);
    return { ids: rows.map((row) => row.id), total: counted[0]?.n ?? 0 };
  }
  const candidates = await tx.$queryRaw<CandidateRow[]>(sql`
    SELECT booking.id, booking.quote_id AS "quoteId", booking.status, booking.charge_paise AS "chargePaise",
      quote.total_paise AS "totalPaise"
    ${FROM} ${where} ${order}`);
  const money = await bookingMoneyOf(
    tx,
    candidates.map((row) => ({ ...row, quote: { totalPaise: row.totalPaise } })),
    today,
  );
  const matching = candidates.filter((row) => money.get(row.id)?.paymentState === input.payment);
  return { ids: matching.slice(offset, offset + input.limit).map((row) => row.id), total: matching.length };
}

export async function bookingTablePageOf(
  tx: OrgTx,
  access: MemberAccess,
  input: BookingTablePageInput,
  now = new Date(),
): Promise<{ items: BookingTableItem[]; total: number }> {
  const today = calendarDateIn(now, await organizationTimeZone(tx, access.organizationId));
  const { ids, total } = await pageIds(tx, access, input, today);
  const rows = await tx.booking.findMany({
    where: { id: { in: ids } },
    select: {
      ...summaryColumns,
      lead: { select: { ownerUserId: true, person: { select: { name: true } } } },
      quote: { select: { title: true, totalPaise: true, adults: true, children: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const summaries = await summariesOf(
    tx,
    ids.flatMap((id) => byId.get(id) ?? []),
    today,
  );
  return {
    items: summaries.flatMap((summary) => {
      const row = byId.get(summary.id);
      return row === undefined
        ? []
        : [{ ...summary, adults: row.quote.adults, children: row.quote.children, ownerUserId: row.lead.ownerUserId }];
    }),
    total,
  };
}
