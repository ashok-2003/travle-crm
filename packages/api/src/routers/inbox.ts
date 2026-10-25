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
  mediaUploadSlot,
  messageIdInput,
  requestMediaUploadInput,
  sendMediaInput,
  sendMessageInput,
  sendTemplateInput,
  sentMessage,
  startChatInput,
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
} from "@travel-crm/domain/inbox";
import { DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = orgProcedure.requires("inbox:view");
const starter = orgProcedure.requires("inbox:view", "leads:create");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");

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
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        conversationHeaderOf(tx, ctx.member, input.conversationId, new Date()),
      ),
    ),

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
    .input(messageIdInput)
    .output(mediaLink)
    .query(({ ctx, input }) => mediaLinkOf(ctx, ctx.member, input.messageId)),

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
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        queueText(tx, ctx.member, input, { whatsappConfigured: ctx.whatsappConfigured }, new Date()),
      ),
    ),

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
});
