// inbox.*: the WhatsApp inbox's reads and the one change that is not sending (spec 6.3, ADR 0035). Reads need inbox:view (own or
// all, like leads:view) and are views; Start a new lead also needs leads:create. A chat out of the member's scope is not found.
// Nothing here returns MSG91's key, a webhook secret or a provider link: files come as presigned links from inbox.mediaUrl.
import {
  chatMessagePage,
  conversationHeader,
  conversationIdInput,
  conversationPage,
  inboxStatus,
  leadChatInput,
  listConversationsInput,
  listMessagesInput,
  mediaLink,
  mediaUrlInput,
  mediaUploadSlot,
  messageIdInput,
  requestMediaUploadInput,
  sendMediaInput,
  sendMessageInput,
  sendTemplateInput,
  sentMessage,
  startChatInput,
  conversationFlagInput,
  createInboxTagInput,
  createQuickReplyInput,
  inboxTag,
  inboxTagIdInput,
  inboxTagList,
  quickReply,
  quickReplyIdInput,
  quickReplyList,
  setConversationTagsInput,
  updateQuickReplyInput,
} from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import {
  conversationHeaderOf,
  inboxStatusOf,
  leadChatOf,
  listConversations,
  listMessages,
  markAnswered,
  mediaLinkOf,
  queueMedia,
  queueTemplate,
  queueText,
  requestMediaUpload,
  retryMessage,
  startChatForLead,
  startLeadFromConversation,
  archiveConversation,
  createQuickReply,
  createTag,
  deleteQuickReply,
  deleteTag,
  listQuickReplies,
  listTags,
  markConversationRead,
  pinConversation,
  setConversationTags,
  updateQuickReply,
} from "@travel-crm/domain/inbox";
import { DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { clearTyping, typingIn } from "../inbox-presence.js";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = orgProcedure.requires("inbox:view");
const starter = orgProcedure.requires("inbox:view", "leads:create");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");
/** The agency's tags and quick replies are written by whoever writes its templates (the Owner and Admins). */
const curator = orgProcedure.requires("inbox:view", "inbox:templates");

export const inboxRouter = router({
  /** Whether WhatsApp is on here and the agency has a number: the page's states (3.1). */
  status: reader
    .output(inboxStatus)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => inboxStatusOf(tx, ctx.whatsappConfigured))),

  conversations: reader
    .input(listConversationsInput)
    .output(conversationPage)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listConversations(tx, ctx.member, input)),
    ),

  conversation: reader
    .input(conversationIdInput)
    .output(conversationHeader)
    .query(async ({ ctx, input }) => {
      const header = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        conversationHeaderOf(tx, ctx.member, input.conversationId, new Date()),
      );
      // Who else is typing here now, by first name (kept in this process's memory, never stored).
      const others = typingIn(ctx.member.organizationId, header.id, ctx.member.userId);
      const names = await memberNames(ctx.identity, ctx.member.organizationId, others);
      return { ...header, replying: others.map((userId) => names[userId]?.split(/\s+/)[0] ?? "").filter(Boolean) };
    }),

  messages: reader
    .input(listMessagesInput)
    .output(chatMessagePage)
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.forOrg(ctx.member.organizationId, (tx) => listMessages(tx, ctx.member, input));
      const people = await memberNames(
        ctx.identity,
        ctx.member.organizationId,
        page.items.map((message) => message.sentBy),
      );
      return { ...page, people };
    }),

  /** The chat of the person a lead belongs to, for the lead's page; none yet is null. */
  leadChat: reader
    .input(leadChatInput)
    .output(z.object({ conversationId: recordId.nullable() }))
    .query(async ({ ctx, input }) => {
      const chat = await ctx.db.forOrg(ctx.member.organizationId, (tx) => leadChatOf(tx, ctx.member, input.leadId));
      return { conversationId: chat?.conversationId ?? null };
    }),

  /** A presigned link to a message's stored file (5 minutes). */
  mediaUrl: reader
    .input(mediaUrlInput)
    .output(mediaLink)
    .query(({ ctx, input }) => mediaLinkOf(ctx, ctx.member, input.messageId, { download: input.download })),

  /** Start a new lead for a past customer's chat (Q2). */
  startLead: starter
    .input(conversationIdInput)
    .output(z.object({ leadId: recordId }))
    .mutation(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const ownerUserId = await ctx.identity.firstOwner(organizationId);
      if (ownerUserId === null) throw new DomainError("CONFLICT", "NO_OWNER", "This agency has no Owner");
      const workers = new Set((await ctx.identity.leadWorkers(organizationId)).map((worker) => worker.userId));
      return ctx.db.forOrg(organizationId, (tx) =>
        startLeadFromConversation(tx, ctx.member, input.conversationId, { ownerUserId, workers }, new Date()),
      );
    }),

  /** Queues a text reply inside the 24-hour window; the worker sends it (S1). One token is one message. */
  send: replier
    .input(sendMessageInput)
    .output(sentMessage)
    .mutation(async ({ ctx, input }) => {
      const sent = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        queueText(tx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
      );
      // They sent it: the others need not be told they are still typing.
      clearTyping(ctx.member.organizationId, input.conversationId, ctx.member.userId);
      return sent;
    }),

  /** Step one of sending a file: the chat is checked and the browser told where to put it. */
  requestMediaUpload: replier
    .input(requestMediaUploadInput)
    .output(mediaUploadSlot)
    .mutation(({ ctx, input }) =>
      requestMediaUpload(ctx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
    ),

  /** Step two: the uploaded file becomes a queued message. */
  sendMedia: replier
    .input(sendMediaInput)
    .output(sentMessage)
    .mutation(({ ctx, input }) =>
      queueMedia(ctx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
    ),

  /** Try again on a message that was not sent: back in the queue, if the window is still open. */
  retry: replier
    .input(messageIdInput)
    .output(sentMessage)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        retryMessage(tx, ctx.member, input.messageId, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
      ),
    ),

  /** Mark as answered: the chat stops waiting for a reply (an answer given by phone, say). */
  markAnswered: replier
    .input(conversationIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => markAnswered(tx, ctx.member, input.conversationId)),
    ),

  /** A template to a chat: outside the window, or the first message to a person who never wrote. */
  sendTemplate: replier
    .input(sendTemplateInput)
    .output(sentMessage)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        queueTemplate(tx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
      ),
    ),

  /** The chat of a lead's person who never wrote, made so a template can start it. Needs leads:edit. */
  startChat: orgProcedure
    .requires("inbox:view", "inbox:reply", "leads:edit")
    .input(startChatInput)
    .output(z.object({ conversationId: recordId }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => startChatForLead(tx, ctx.member, input.leadId)),
    ),

  /** The agency's tags for chats (sales inbox spec 5). */
  tags: reader.output(inboxTagList).query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listTags(tx))),

  createTag: curator
    .input(createInboxTagInput)
    .output(inboxTag)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => createTag(tx, ctx.member, input))),

  deleteTag: curator
    .input(inboxTagIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteTag(tx, ctx.member, input.tagId)),
    ),

  /** The chat's tags become exactly these. */
  setTags: replier
    .input(setConversationTagsInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setConversationTags(tx, ctx.member, input)),
    ),

  /** Saved answers typed with "/" (sales inbox spec 5). */
  quickReplies: reader
    .output(quickReplyList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listQuickReplies(tx))),

  createQuickReply: curator
    .input(createQuickReplyInput)
    .output(quickReply)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createQuickReply(tx, ctx.member, input)),
    ),

  updateQuickReply: curator
    .input(updateQuickReplyInput)
    .output(quickReply)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateQuickReply(tx, ctx.member, input)),
    ),

  deleteQuickReply: curator
    .input(quickReplyIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteQuickReply(tx, ctx.member, input.quickReplyId)),
    ),

  /** Pin a chat to the top of everyone's inbox, or unpin it. */
  pin: replier
    .input(conversationFlagInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        pinConversation(tx, ctx.member, input.conversationId, input.on, new Date()),
      ),
    ),

  /** Archive a chat (until the customer writes again), or bring it back. */
  archive: replier
    .input(conversationFlagInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        archiveConversation(tx, ctx.member, input.conversationId, input.on, new Date()),
      ),
    ),

  /**
   * The member has the chat open: their unread count for it goes to nothing. Reading, yet it writes a row, so it is a
   * mutation that every subscription state may make (a read-only agency still reads its chats).
   */
  markRead: reader
    .meta({ lifecycle: "always" })
    .input(conversationIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        markConversationRead(tx, ctx.member, input.conversationId, new Date()),
      ),
    ),
});
