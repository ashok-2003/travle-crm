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

/** Who may hear of a chat: whether it is listed, and its person's live leads' owners. A chat that is gone is heard by nobody. */
export async function chatAudienceOf(
  db: Database,
  organizationId: string,
  conversationId: string,
): Promise<ChatAudience> {
  return db.forOrg(organizationId, async (tx) => {
    const chat = await tx.whatsappConversation.findUnique({
      where: { id: conversationId },
      select: { hidden: true, state: true, personId: true },
    });
    if (chat === null) return { listed: false, leadOwners: [] };
    const leads =
      chat.personId === null
        ? []
        : await tx.lead.findMany({
            where: { personId: chat.personId, deletedAt: null },
            select: { ownerUserId: true },
          });
    return { listed: !chat.hidden && chat.state === "open", leadOwners: leads.map((lead) => lead.ownerUserId) };
  });
}
