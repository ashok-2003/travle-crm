// The Inbox's live stream, the domain's part (inbox revamp spec, part 1 item 4): what a notification on the inbox_live
// channel says (written by the database's triggers on every saved message and changed chat, @travel-crm/db), and who may
// hear of it: the chat's audience, which maySeeChat (scope.ts) reads per member as the list's own rule does.
import { inboxLiveEvent, type InboxLiveEvent } from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import type { Database } from "@travel-crm/db";
import type { ChatAudience } from "./scope.js";

export interface InboxNotification extends InboxLiveEvent {
  organizationId: string;
}

const inboxNotification = inboxLiveEvent.extend({ organizationId: recordId });

/** A notification's payload as the triggers write it, or null for anything else. */
export function parseInboxNotification(payload: string): InboxNotification | null {
  try {
    const parsed = inboxNotification.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Who may hear of each of these chats, in one transaction: whether the list shows it, and its person's live leads'
 * owners. A chat that is gone is heard by nobody.
 */
export async function chatAudiencesOf(
  db: Database,
  organizationId: string,
  conversationIds: readonly string[],
): Promise<Map<string, ChatAudience>> {
  return db.forOrg(organizationId, async (tx) => {
    const chats = await tx.whatsappConversation.findMany({
      where: { id: { in: [...conversationIds] } },
      select: { id: true, hidden: true, state: true, personId: true },
    });
    const personIds = chats.map((chat) => chat.personId).filter((id): id is string => id !== null);
    const leads =
      personIds.length === 0
        ? []
        : await tx.lead.findMany({
            where: { personId: { in: personIds }, deletedAt: null },
            select: { personId: true, ownerUserId: true },
          });
    const audiences = new Map<string, ChatAudience>(
      conversationIds.map((id) => [id, { listed: false, leadOwners: [] }]),
    );
    for (const chat of chats) {
      audiences.set(chat.id, {
        listed: !chat.hidden && chat.state === "open",
        leadOwners: leads.filter((lead) => lead.personId === chat.personId).map((lead) => lead.ownerUserId),
      });
    }
    return audiences;
  });
}
