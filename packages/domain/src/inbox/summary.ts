// The counts above the inbox (sales inbox spec 6): how many chats wait for a reply and how many of those are late, the
// member's unread, theirs, the unassigned and the snoozed, and the chats by their lead's stage, the pipeline at a glance.
// Every count is of the chats the member may see, and all of them come from one statement, since the page asks every 15
// seconds. The rules are the lists' own (views.ts): an awake chat is neither archived nor snoozed past now; "waiting" is the
// waiting mark; "mine" and "unassigned" are by the chat's person's leads; the stages count a chat once for each stage one of
// its leads (in the member's lead scope) is in.
import { inboxSummary, REPLY_TARGET_MINUTES, type InboxSummary } from "@travel-crm/contracts/inbox";
import { openLeadStages } from "@travel-crm/contracts/crm";
import { joinSql, sql, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { visibleChatSql } from "./scope-sql.js";

export async function summaryOf(tx: OrgTx, access: MemberAccess, now: Date): Promise<InboxSummary> {
  const lateBefore = new Date(now.getTime() - REPLY_TARGET_MINUTES * 60_000);
  const leadScope = access.permissions.scopeOf("leads:view");
  const inScope = leadScope === "own" ? sql`l.owner_user_id = ${access.userId}::uuid` : sql`TRUE`;
  const open = joinSql(openLeadStages.map((stage) => sql`${stage}`));
  const [row] = await tx.$queryRaw<Record<string, number>[]>(sql`
    SELECT
      count(*) FILTER (WHERE awake AND needs_reply)::int AS waiting,
      count(*) FILTER (WHERE awake AND needs_reply AND last_inbound_at < ${lateBefore})::int AS late,
      count(*) FILTER (WHERE awake AND unread)::int AS unread,
      count(*) FILTER (WHERE awake AND mine)::int AS mine,
      count(*) FILTER (WHERE awake AND unassigned)::int AS unassigned,
      count(*) FILTER (WHERE archived_at IS NULL AND snoozed_until > ${now})::int AS snoozed,
      count(*) FILTER (WHERE awake AND in_new)::int AS new,
      count(*) FILTER (WHERE awake AND in_contacted)::int AS contacted,
      count(*) FILTER (WHERE awake AND in_quote_sent)::int AS quote_sent,
      count(*) FILTER (WHERE awake AND in_booking_requested)::int AS booking_requested,
      count(*) FILTER (WHERE awake AND in_won)::int AS won
    FROM (
      SELECT c.needs_reply, c.last_inbound_at, c.archived_at, c.snoozed_until,
        (c.archived_at IS NULL AND (c.snoozed_until IS NULL OR c.snoozed_until <= ${now})) AS awake,
        (c.last_inbound_at IS NOT NULL AND (r.read_at IS NULL OR c.last_inbound_at > r.read_at)) AS unread,
        COALESCE(f.mine, false) AS mine,
        COALESCE(f.unassigned, false) AS unassigned,
        COALESCE(f.in_new, false) AS in_new,
        COALESCE(f.in_contacted, false) AS in_contacted,
        COALESCE(f.in_quote_sent, false) AS in_quote_sent,
        COALESCE(f.in_booking_requested, false) AS in_booking_requested,
        COALESCE(f.in_won, false) AS in_won
      FROM whatsapp_conversation c
      LEFT JOIN conversation_read r
        ON r.organization_id = c.organization_id AND r.conversation_id = c.id AND r.user_id = ${access.userId}::uuid
      LEFT JOIN LATERAL (
        SELECT
          bool_or(l.owner_user_id = ${access.userId}::uuid) AS mine,
          bool_or(l.owner_user_id IS NULL AND l.stage IN (${open})) AS unassigned,
          bool_or(l.stage = 'new' AND ${inScope}) AS in_new,
          bool_or(l.stage = 'contacted' AND ${inScope}) AS in_contacted,
          bool_or(l.stage = 'quote_sent' AND ${inScope}) AS in_quote_sent,
          bool_or(l.stage = 'booking_requested' AND ${inScope}) AS in_booking_requested,
          bool_or(l.stage = 'won' AND ${inScope}) AS in_won
        FROM lead l WHERE l.person_id = c.person_id AND l.deleted_at IS NULL
      ) f ON true
      WHERE c.hidden = false AND c.state = 'open' AND ${visibleChatSql(access)}
    ) chats`);
  return inboxSummary.parse({
    waiting: row?.waiting ?? 0,
    late: row?.late ?? 0,
    unread: row?.unread ?? 0,
    mine: row?.mine ?? 0,
    unassigned: row?.unassigned ?? 0,
    snoozed: row?.snoozed ?? 0,
    stages: {
      new: row?.new ?? 0,
      contacted: row?.contacted ?? 0,
      quote_sent: row?.quote_sent ?? 0,
      booking_requested: row?.booking_requested ?? 0,
      won: row?.won ?? 0,
    },
  });
}
