// salesInbox.*: the sales inbox beyond WhatsApp (sales inbox spec 6): the counts above the chats, stars, snooze, team notes
// with @mentions, messages sent later, "someone is replying", the automatic answers and broadcasts to a tag. Reads need
// inbox:view; acting on a chat inbox:reply; the agency's automatic answers and broadcasts inbox:templates (the Owner and
// Admins), as its templates do.
import {
  addConversationNoteInput,
  conversationIdInput,
  conversationNote,
  conversationNoteList,
  createKeywordReplyInput,
  forwardMessageInput,
  inboxAutomation,
  inboxSummary,
  keywordReply,
  keywordReplyIdInput,
  keywordReplyList,
  saveInboxAutomationInput,
  scheduledIdInput,
  scheduledMessage,
  scheduledMessageList,
  scheduleMessageInput,
  snoozeInput,
  starMessageInput,
} from "@travel-crm/contracts/inbox";
import {
  addNote,
  automationOf,
  cancelScheduled,
  createKeywordReply,
  deleteKeywordReply,
  forwardMessage,
  listKeywordReplies,
  listNotes,
  listScheduled,
  saveAutomation,
  scheduleMessage,
  snoozeConversation,
  starMessage,
  summaryOf,
  visibleConversation,
} from "@travel-crm/domain/inbox";
import { markTyping } from "../inbox-presence.js";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = orgProcedure.requires("inbox:view");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");
const curator = orgProcedure.requires("inbox:view", "inbox:templates");
/** A note is a note on the chat's lead, so it takes the permission a lead's own notes take. */
const noter = orgProcedure.requires("inbox:view", "leads:edit");

export const salesInboxRouter = router({
  /** The chips' counts and the chats by their lead's stage. */
  summary: reader
    .output(inboxSummary)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => summaryOf(tx, ctx.member, new Date()))),

  star: replier
    .input(starMessageInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        starMessage(tx, ctx.member, input.messageId, input.on, new Date()),
      ),
    ),

  forward: replier
    .input(forwardMessageInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        forwardMessage(tx, ctx.member, input.messageId, input.toConversationId),
      ),
    ),

  snooze: replier
    .input(snoozeInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        snoozeConversation(
          tx,
          ctx.member,
          input.conversationId,
          input.until === null ? null : new Date(input.until),
          new Date(),
        ),
      ),
    ),

  /** The chat's team notes (notes on its lead), with the names of their writers. */
  notes: reader
    .input(conversationIdInput)
    .output(conversationNoteList)
    .query(async ({ ctx, input }) => {
      const { items, leadId } = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        listNotes(tx, ctx.member, input.conversationId),
      );
      const people = await memberNames(
        ctx.identity,
        ctx.member.organizationId,
        items.map((note) => note.createdBy),
      );
      return { items, leadId, people };
    }),

  /** A note on the chat's lead; whoever it mentions (among those who may see that lead) is told. */
  addNote: noter
    .input(addConversationNoteInput)
    .output(conversationNote)
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const mentioned = await Promise.all(
        [...new Set(input.mentions)].map(
          async (userId) => [userId, await ctx.identity.resolveAccess(userId, organizationId)] as const,
        ),
      );
      const members = new Map(
        mentioned.flatMap(([userId, access]) => (access === null ? [] : [[userId, access] as const])),
      );
      const names = await memberNames(ctx.identity, organizationId, [ctx.member.userId]);
      return ctx.db.forOrg(organizationId, (tx) =>
        addNote(tx, ctx.member, input, members, names[ctx.member.userId] ?? "A teammate"),
      );
    }),

  scheduled: reader
    .input(conversationIdInput)
    .output(scheduledMessageList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listScheduled(tx, ctx.member, input.conversationId)),
    ),

  schedule: replier
    .input(scheduleMessageInput)
    .output(scheduledMessage)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => scheduleMessage(tx, ctx.member, input, new Date())),
    ),

  cancelScheduled: replier
    .input(scheduledIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => cancelScheduled(tx, ctx.member, input.scheduledId)),
    ),

  /**
   * The member is typing in the chat (shown to the others for a few seconds). Kept in memory, never stored, and only for a
   * chat the member may see: a chat out of their scope is "not found", as everywhere.
   */
  typing: reader
    .meta({ lifecycle: "always" })
    .input(conversationIdInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => visibleConversation(tx, ctx.member, input.conversationId));
      markTyping(ctx.member.organizationId, input.conversationId, ctx.member.userId);
    }),

  automation: curator
    .output(inboxAutomation)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => automationOf(tx))),

  saveAutomation: curator
    .input(saveInboxAutomationInput)
    .output(inboxAutomation)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAutomation(tx, ctx.member, input)),
    ),

  keywordReplies: curator
    .output(keywordReplyList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listKeywordReplies(tx))),

  createKeywordReply: curator
    .input(createKeywordReplyInput)
    .output(keywordReply)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createKeywordReply(tx, ctx.member, input)),
    ),

  deleteKeywordReply: curator
    .input(keywordReplyIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteKeywordReply(tx, ctx.member, input.keywordReplyId)),
    ),
});
