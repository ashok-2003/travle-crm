// Who sees which chats (spec 6.3, Q1): the same people who see the lead. `inbox:view` with the scope "all" sees every chat;
// with "own" the chats of people with any lead (open or closed) the member can see under their leads:view scope. A chat
// whose person has no lead is for the "all" scope alone.
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
  return { person: { is: { leads: { some: leadScope === "all" ? {} : { ownerUserId: access.userId } } } } };
}
