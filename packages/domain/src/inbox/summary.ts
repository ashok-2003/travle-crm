// The counts above the inbox (sales inbox spec 6): how many chats wait for a reply and how many of those are late, the
// member's unread, theirs, the unassigned and the snoozed, and the chats by their lead's stage, the pipeline at a glance.
// Every count is of the chats the member may see.
import { inboxSummary, REPLY_TARGET_MINUTES, type InboxSummary } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { visibleConversations, type ConversationWhere } from "./scope.js";
import { awakeWhere, presetWhere, unreadIdsOf } from "./views.js";

const pipelineStages = ["new", "contacted", "quote_sent", "booking_requested", "won"] as const;

export async function summaryOf(tx: OrgTx, access: MemberAccess, now: Date): Promise<InboxSummary> {
  const shown: ConversationWhere[] = [{ hidden: false, state: "open" }, visibleConversations(access)];
  const count = (...where: ConversationWhere[]) =>
    tx.whatsappConversation.count({ where: { AND: [...shown, ...where] } });
  const awake = awakeWhere(now);
  const lateBefore = new Date(now.getTime() - REPLY_TARGET_MINUTES * 60_000);
  const leadScope = access.permissions.scopeOf("leads:view");
  const stageCounts: Record<(typeof pipelineStages)[number], number> = {
    new: 0,
    contacted: 0,
    quote_sent: 0,
    booking_requested: 0,
    won: 0,
  };
  // One query at a time: a transaction runs its statements in turn.
  for (const stage of pipelineStages) {
    stageCounts[stage] = await count(awake, {
      person: {
        is: {
          leads: {
            some: { deletedAt: null, stage, ...(leadScope === "own" ? { ownerUserId: access.userId } : {}) },
          },
        },
      },
    });
  }
  const unreadIds = await unreadIdsOf(tx, access);
  return inboxSummary.parse({
    waiting: await count(awake, presetWhere(access, "waiting")),
    late: await count(awake, presetWhere(access, "waiting"), { lastInboundAt: { lt: lateBefore } }),
    unread: unreadIds.length === 0 ? 0 : await count(awake, { id: { in: unreadIds } }),
    mine: await count(awake, presetWhere(access, "mine")),
    unassigned: await count(awake, presetWhere(access, "unassigned")),
    snoozed: await count({ archivedAt: null, snoozedUntil: { gt: now } }),
    stages: stageCounts,
  });
}
