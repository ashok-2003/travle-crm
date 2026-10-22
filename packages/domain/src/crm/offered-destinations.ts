// The destinations the website form offers (W8, F9): the agency's live ones, the 100 with the most leads first, then by name.
// crm owns the leads, so crm owns this query; the website-forms module takes no destination.
import { sql, type OrgTx, type Sql } from "@travel-crm/db";
import { formLimits } from "../website-forms/index.js";

/** The SQL of the read, exported so a test plans exactly what runs. */
export const offeredDestinationsQuery = (): Sql => sql`
    SELECT d.id, d.name
    FROM destination d
    LEFT JOIN (
      SELECT destination_id, count(*) AS leads
      FROM lead
      WHERE deleted_at IS NULL AND destination_id IS NOT NULL
      GROUP BY destination_id
    ) used ON used.destination_id = d.id
    WHERE d.deleted_at IS NULL
    ORDER BY coalesce(used.leads, 0) DESC, d.name ASC, d.id ASC
    LIMIT ${formLimits.destinationsOffered}`;

export async function offeredDestinations(tx: OrgTx): Promise<{ id: string; name: string }[]> {
  return tx.$queryRaw<{ id: string; name: string }[]>(offeredDestinationsQuery());
}
