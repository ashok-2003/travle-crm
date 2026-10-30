// What an accepted quote counts as sold, before GST, in the agency's figures (release 6): its subtotal, or, once its booking
// was cancelled, the cancellation charge it kept (before GST), since that is all it earned. A fragment over the alias `q` of
// the quote table, for the finance and report queries; refunds are separate rows and are taken off the cash collected.
import { sql } from "@travel-crm/db";

export const quoteSalesSql = sql`coalesce((SELECT CASE WHEN b.status = 'cancelled'
    THEN round(b.charge_paise::numeric * q.subtotal_paise / NULLIF(q.total_paise, 0))::bigint ELSE q.subtotal_paise END
  FROM booking b WHERE b.quote_id = q.id AND b.deleted_at IS NULL LIMIT 1), q.subtotal_paise)`;

/** The GST on that sale: the quote's tax, or, once cancelled, the part of the charge that is tax. */
export const quoteTaxSql = sql`coalesce((SELECT CASE WHEN b.status = 'cancelled'
    THEN b.charge_paise - round(b.charge_paise::numeric * q.subtotal_paise / NULLIF(q.total_paise, 0))::bigint ELSE q.tax_paise END
  FROM booking b WHERE b.quote_id = q.id AND b.deleted_at IS NULL LIMIT 1), q.tax_paise)`;

/** What a customer owes on the quote: its total, or, once cancelled, the charge. */
export const quoteOwedSql = sql`coalesce((SELECT CASE WHEN b.status = 'cancelled' THEN b.charge_paise ELSE q.total_paise END
  FROM booking b WHERE b.quote_id = q.id AND b.deleted_at IS NULL LIMIT 1), q.total_paise)`;
