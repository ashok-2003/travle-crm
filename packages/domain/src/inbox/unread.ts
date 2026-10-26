// What the customer wrote that a member has not seen (sales inbox spec 5): a chat's unread messages are the customer's after
// the member's read mark on it, and the Unread filter is the chats with any. Counted in SQL, one statement for a page.
import { joinSql, sql, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { visibleChatSql } from "./scope-sql.js";

/** The most chats the Unread filter looks at: the newest ones, so a cut never hides what just arrived. */
export const UNREAD_FILTER_LIMIT = 1000;

/** The chats with something from the customer this member has not seen, the newest message first. */
export async function unreadIdsOf(tx: OrgTx, access: MemberAccess): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>(sql`
    SELECT c.id FROM whatsapp_conversation c
    LEFT JOIN conversation_read r
      ON r.organization_id = c.organization_id AND r.conversation_id = c.id AND r.user_id = ${access.userId}::uuid
    WHERE c.hidden = false AND c.state = 'open' AND ${visibleChatSql(access)}
      AND c.last_inbound_at IS NOT NULL AND (r.read_at IS NULL OR c.last_inbound_at > r.read_at)
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
    LIMIT ${UNREAD_FILTER_LIMIT}`);
  return rows.map((row) => row.id);
}

/** For a page of chats, the customer's messages each member has not seen yet, at most 99 a chat. */
export async function unreadCounts(
  tx: OrgTx,
  access: MemberAccess,
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; unread: number }[]>(sql`
    SELECT m.conversation_id AS id, count(*)::int AS unread
    FROM whatsapp_message m
    LEFT JOIN conversation_read r
      ON r.organization_id = m.organization_id AND r.conversation_id = m.conversation_id
      AND r.user_id = ${access.userId}::uuid
    WHERE m.conversation_id IN (${joinSql(conversationIds.map((id) => sql`${id}::uuid`))})
      AND m.direction = 'in' AND m.kind <> 'reaction'
      AND (r.read_at IS NULL OR m.occurred_at > r.read_at)
    GROUP BY m.conversation_id`);
  return new Map(rows.map((row) => [row.id, Math.min(row.unread, 99)]));
}
