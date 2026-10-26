// Team notes in a chat (sales inbox spec 6, owner decision 4 of 2026-10-26): a note written in the chat is a note on the
// chat's lead (crm's lead notes, with their audit and their erasure), shown among the chat's messages at its time and never
// sent to the customer. A note names teammates with "@"; each one named who may see that lead is told (a bell and a push),
// with a link to the chat. Nothing about who was named is stored: the words are the note's own.
import type { AddConversationNoteInput, ConversationNote } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { addLeadNote, isLeadInScope, listLeadNotes } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { chatNameOf } from "./chat-name.js";
import { visibleConversations } from "./scope.js";
import { leadOfChat, visibleConversation } from "./views.js";

/** The kind of notice a mention sends. */
export const MENTION_KIND = "inbox.mentioned";

const MAX_NOTES = 200;

const shown = (row: { id: string; body: string; createdBy: string | null; createdAt: Date }): ConversationNote => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

/** The chat's notes, newest first (at most 200: older ones are on the lead's page), and the lead they belong to. */
export async function listNotes(
  tx: OrgTx,
  access: MemberAccess,
  conversationId: string,
): Promise<{ items: ConversationNote[]; leadId: string | null }> {
  const chat = await visibleConversation(tx, access, conversationId);
  const lead = await leadOfChat(tx, access, chat.personId);
  if (lead === null) return { items: [], leadId: null };
  return { items: (await listLeadNotes(tx, lead.id, MAX_NOTES)).map(shown), leadId: lead.id };
}

/** Whether the member could open this chat and read the lead's notes: the notice would only point them somewhere closed. */
async function mayReadNote(tx: OrgTx, who: MemberAccess, conversationId: string, leadOwner: string | null) {
  if (!who.permissions.has("inbox:view") || !who.permissions.has("leads:view")) return false;
  if (!isLeadInScope(who, leadOwner)) return false;
  const chat = await tx.whatsappConversation.findFirst({
    where: { AND: [{ id: conversationId }, visibleConversations(who)] },
    select: { id: true },
  });
  return chat !== null;
}

/**
 * Adds a note to the chat's lead. `members` holds the access of each organization member the caller found among the
 * mentioned ids: a mention of anyone else is refused, and one of a member who can't see the lead is told nothing.
 */
export async function addNote(
  tx: OrgTx,
  access: MemberAccess,
  input: AddConversationNoteInput,
  members: ReadonlyMap<string, MemberAccess>,
  writerName: string,
): Promise<ConversationNote> {
  const chat = await visibleConversation(tx, access, input.conversationId);
  const mentions = [...new Set(input.mentions)];
  if (mentions.some((userId) => !members.has(userId))) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Someone mentioned is not in this agency");
  }
  const lead = await leadOfChat(tx, access, chat.personId);
  if (lead === null) {
    throw new DomainError("CONFLICT", "CHAT_HAS_NO_LEAD", "This chat has no lead yet to hold a note");
  }
  const note = await addLeadNote(tx, access, { leadId: lead.id, body: input.body });
  const told: string[] = [];
  for (const userId of mentions) {
    const who = members.get(userId);
    if (who !== undefined && (await mayReadNote(tx, who, chat.id, lead.ownerUserId))) told.push(userId);
  }
  if (told.length > 0) {
    // The note's words stay in the app: the notice names who wrote and which chat, never what the note says.
    await notify(tx, access, {
      recipientUserIds: told,
      kind: MENTION_KIND,
      title: `${writerName} mentioned you in a chat`,
      body: `In the chat with ${chatNameOf(chat) ?? "a customer"}.`,
      link: `/inbox/${chat.id}`,
      channels: ["push"],
    });
  }
  return shown(note);
}
