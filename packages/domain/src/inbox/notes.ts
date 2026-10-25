// Team notes in a chat (sales inbox spec 6): words for the team only, shown among the messages and never sent. A note
// names teammates with "@", and each named one is told (a bell and a push), with a link to the chat. Notes are kept as
// written: the runtime role can neither change nor remove one.
import type { AddConversationNoteInput, ConversationNote } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { chatNameOf } from "./chat-name.js";
import { visibleConversation } from "./views.js";

/** The kind of notice a mention sends. */
export const MENTION_KIND = "inbox.mentioned";

const MAX_NOTES = 200;

/** The chat's notes, newest first (at most 200: older ones are on the lead's page). */
export async function listNotes(tx: OrgTx, access: MemberAccess, conversationId: string): Promise<ConversationNote[]> {
  const chat = await visibleConversation(tx, access, conversationId);
  const rows = await tx.conversationNote.findMany({
    where: { conversationId: chat.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_NOTES,
    select: { id: true, body: true, mentions: true, createdBy: true, createdAt: true },
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Adds a note. `members` are the organization's member ids the caller checked the mentions against: a mention of anyone
 * else is refused, so a note can't page a stranger.
 */
export async function addNote(
  tx: OrgTx,
  access: MemberAccess,
  input: AddConversationNoteInput,
  members: ReadonlySet<string>,
  writerName: string,
): Promise<ConversationNote> {
  const chat = await visibleConversation(tx, access, input.conversationId);
  const mentions = [...new Set(input.mentions)];
  if (mentions.some((userId) => !members.has(userId))) {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "Someone mentioned is not in this agency");
  }
  const row = await tx.conversationNote.create({
    data: { conversationId: chat.id, body: input.body, mentions, createdBy: access.userId },
    select: { id: true, body: true, mentions: true, createdBy: true, createdAt: true },
  });
  if (mentions.length > 0) {
    // The note's words stay in the app: the notice names who wrote and which chat, never what the note says.
    await notify(tx, access, {
      recipientUserIds: mentions,
      kind: MENTION_KIND,
      title: `${writerName} mentioned you in a chat`,
      body: `In the chat with ${chatNameOf(chat) ?? "a customer"}.`,
      link: `/inbox/${chat.id}`,
      channels: ["push"],
    });
  }
  return { ...row, createdAt: row.createdAt.toISOString() };
}
