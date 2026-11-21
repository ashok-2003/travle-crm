// The New leads nobody has contacted yet (leads show spec, 2026-11-21): still in New, with no call logged on the lead
// and no message sent to its person since it came in. A message counts when it went or may yet go (not failed or
// superseded), from a member, their phone or the AI; the automatic welcome, away and keyword answers (`auto:` tokens)
// and broadcasts are not a reply to the enquiry. My tasks' "New lead, not contacted yet" and the Leads list's Show read
// this one rule, longest waiting first, as composable SQL over lead_new_by_owner (R11: the performance tests EXPLAIN it).
import { emptySql, sql, type OrgTx, type Sql } from "@travel-crm/db";

export interface UncontactedLeadsFilter {
  /** One owner's leads; every lead when left out (the caller's list applies its own scope). */
  ownerUserId?: string;
  /** The last lead id of the previous page. */
  after?: string;
  /** Every one when left out. */
  limit?: number;
}

/** A lead still waiting for its first contact, and since when: the moment it came in. */
export interface UncontactedLead {
  leadId: string;
  waitingSince: Date;
}

function uncontacted(ownerUserId: string | undefined): Sql {
  return sql`lead.stage = 'new' AND lead.deleted_at IS NULL
    ${ownerUserId === undefined ? emptySql : sql`AND lead.owner_user_id = ${ownerUserId}::uuid`}
    AND NOT EXISTS (
      SELECT 1 FROM lead_call
      WHERE lead_call.organization_id = lead.organization_id AND lead_call.lead_id = lead.id
        AND lead_call.deleted_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM whatsapp_conversation chat
      JOIN whatsapp_message message
        ON message.organization_id = chat.organization_id AND message.conversation_id = chat.id
      WHERE chat.organization_id = lead.organization_id AND chat.person_id = lead.person_id
        AND message.direction = 'out' AND message.occurred_at >= lead.created_at
        AND message.status NOT IN ('failed', 'superseded') AND message.broadcast_id IS NULL
        AND (message.client_token IS NULL OR message.client_token NOT LIKE 'auto:%'))`;
}

/** The uncontacted leads, oldest first (UUID v7 ids are in the order they were made). */
export function uncontactedLeadsQuery(filter: UncontactedLeadsFilter): Sql {
  return sql`
    SELECT lead.id AS "leadId", lead.created_at AS "waitingSince" FROM lead
    WHERE ${uncontacted(filter.ownerUserId)}
      ${filter.after === undefined ? emptySql : sql`AND lead.id > ${filter.after}::uuid`}
    ORDER BY lead.id
    ${filter.limit === undefined ? emptySql : sql`LIMIT ${filter.limit}`}`;
}

export async function uncontactedLeads(tx: OrgTx, filter: UncontactedLeadsFilter): Promise<UncontactedLead[]> {
  return tx.$queryRaw<UncontactedLead[]>(uncontactedLeadsQuery(filter));
}

/** How many of the owner's leads wait for their first contact. */
export function countUncontactedLeadsQuery(ownerUserId: string): Sql {
  return sql`SELECT count(*)::int AS n FROM lead WHERE ${uncontacted(ownerUserId)}`;
}

export async function countUncontactedLeads(tx: OrgTx, ownerUserId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>(countUncontactedLeadsQuery(ownerUserId));
  return row?.n ?? 0;
}
