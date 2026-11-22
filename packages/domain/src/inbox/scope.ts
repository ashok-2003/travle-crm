// Who sees which chats (spec 6.3, Q1): the same people who see the lead. `inbox:view` with the scope "all" sees every chat;
// with "own" the chats of people with any lead (open or closed) the member can see under their leads:view scope. A chat
// whose person has no lead is for the "all" scope alone. The list's where-clause and the live stream's check of one chat
// (maySeeChat, on the chat's audience from live.ts) are the same rule.
import type { WhatsappConversationWhere } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export type ConversationWhere = WhatsappConversationWhere;

/** A where-clause fragment for whatsappConversation limiting a list to what the member may see. */
export function visibleConversations(access: MemberAccess): ConversationWhere {
  const scope = access.permissions.scopeOf("inbox:view");
  if (scope === null) throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires inbox:view");
  if (scope === "all") return {};
  const leadScope = access.permissions.scopeOf("leads:view");
  if (leadScope === null) return { id: { in: [] } };
  return {
    person: {
      is: { leads: { some: { deletedAt: null, ...(leadScope === "all" ? {} : { ownerUserId: access.userId }) } } },
    },
  };
}

/** What decides who may see one chat: whether the list shows it at all, and the owners of its person's live leads. */
export interface ChatAudience {
  /** Neither hidden (a blocked contact's) nor closed: the list's own condition. */
  listed: boolean;
  /** One entry per live lead of the chat's person: its owner's user id, or null for an unassigned lead. */
  leadOwners: (string | null)[];
}

/** Whether the member may see this chat: visibleConversations, for one chat whose audience is known. */
export function maySeeChat(access: MemberAccess, audience: ChatAudience): boolean {
  if (!audience.listed) return false;
  const scope = access.permissions.scopeOf("inbox:view");
  if (scope === null) return false;
  if (scope === "all") return true;
  const leadScope = access.permissions.scopeOf("leads:view");
  if (leadScope === null) return false;
  return leadScope === "all" ? audience.leadOwners.length > 0 : audience.leadOwners.includes(access.userId);
}
