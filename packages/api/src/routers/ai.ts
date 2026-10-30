// ai.*: Suggest reply (ADR 0029; the owner's decision of 2026-10-28). Anyone who may reply in a chat and holds ai:suggest
// asks for a draft (a mutation: it spends one of the agency's suggestions); only whoever holds ai:manage, from a session
// read afresh, turns it on for the agency and writes its instructions and its media. The bookings the AI took show on
// the lead for anyone who sees it, and whoever may work the lead confirms or cancels one. The plan's AI module is checked
// on every call.
import {
  addAiKnowledgeInput,
  aiBookingList,
  aiBookingsInput,
  aiMediaIdInput,
  aiMediaLink,
  aiMediaList,
  aiMediaSlot,
  confirmAiMediaInput,
  requestAiMediaInput,
  setAiBookingStatusInput,
  updateAiMediaInput,
  aiDocumentSlot,
  aiLearnResult,
  aiLearningList,
  aiOverview,
  aiVoice,
  autopilotSettings,
  chatAi,
  conversationAiInput,
  clearChatVoiceInput,
  learnChatVoiceInput,
  learnVoiceInput,
  testAiAnswer,
  testAiInput,
  saveAutopilotInput,
  setAiLearningInput,
  setChatAiInput,
  setChatPersonaInput,
  aiKnowledgeIdInput,
  aiKnowledgeList,
  aiSettings,
  aiStatus,
  confirmAiDocumentInput,
  leadInsightAnswer,
  leadInsightInput,
  requestAiDocumentInput,
  saveAiSettingsInput,
  suggestedReply,
  suggestReplyInput,
  updateAiKnowledgeInput,
} from "@travel-crm/contracts/ai";
import {
  addKnowledge,
  aiAllowed,
  bookingsOfLead,
  confirmMedia,
  deleteMedia,
  listMedia,
  mediaLink,
  requestMedia,
  setBookingStatus,
  updateMedia,
  aiEnabled,
  aiOverviewOf,
  aiSettingsOf,
  autopilotSettingsOf,
  chatAiOf,
  clearChatVoice,
  clearVoice,
  learnChatVoice,
  testAnswer,
  learnNow,
  learnVoice,
  listLearnings,
  resumeChat,
  saveAutopilot,
  setChatMode,
  setChatPersona,
  setLearning,
  confirmDocument,
  deleteKnowledge,
  leadInsightOf,
  listKnowledge,
  requestDocument,
  saveAiSettings,
  suggestReply,
  updateKnowledge,
} from "@travel-crm/domain/ai";
import { getLead } from "@travel-crm/domain/crm";
import { DomainError } from "@travel-crm/domain/kernel";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const aiRouter = router({
  /** Whether the agency has Suggest reply on, for the composer to offer the button. */
  status: orgProcedure
    .requires("ai:suggest")
    .output(aiStatus)
    .query(async ({ ctx }) => ({
      enabled: ctx.ai?.configured === true && (await ctx.db.forOrg(ctx.member.organizationId, (tx) => aiEnabled(tx))),
    })),

  settings: freshProcedure
    .requires("ai:manage")
    .output(aiSettings)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        aiSettingsOf(tx, {
          organizationId: ctx.member.organizationId,
          providerReady: ctx.ai?.configured === true,
          now: new Date(),
        }),
      ),
    ),

  saveSettings: freshProcedure
    .requires("ai:manage")
    .input(saveAiSettingsInput)
    .output(aiSettings)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        saveAiSettings(tx, ctx.member, input, { providerReady: ctx.ai?.configured === true, now: new Date() }),
      ),
    ),

  /** What the agency told its AI to know. */
  knowledge: freshProcedure
    .requires("ai:manage")
    .output(aiKnowledgeList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listKnowledge(tx))),

  addKnowledge: freshProcedure
    .requires("ai:manage")
    .input(addAiKnowledgeInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => addKnowledge(tx, ctx.member, input)),
    ),

  updateKnowledge: freshProcedure
    .requires("ai:manage")
    .input(updateAiKnowledgeInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateKnowledge(tx, ctx.member, input)),
    ),

  /** Deletes a piece of knowledge, and a document's file with it. */
  deleteKnowledge: freshProcedure
    .requires("ai:manage")
    .input(aiKnowledgeIdInput)
    .mutation(({ ctx, input }) => deleteKnowledge(ctx, ctx.member, input.knowledgeId)),

  /** Step one of a document: where the browser puts the file. */
  requestKnowledgeDocument: freshProcedure
    .requires("ai:manage")
    .input(requestAiDocumentInput)
    .output(aiDocumentSlot)
    .mutation(({ ctx, input }) => requestDocument(ctx, ctx.member, input)),

  /** Step two: the file is stored; the worker reads its words. */
  confirmKnowledgeDocument: freshProcedure
    .requires("ai:manage")
    .input(confirmAiDocumentInput)
    .mutation(({ ctx, input }) => confirmDocument(ctx, ctx.member, input)),

  /** The photos, videos and PDFs the AI may send. */
  media: freshProcedure
    .requires("ai:manage")
    .output(aiMediaList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listMedia(tx))),

  /** Step one of a media file: where the browser puts it. */
  requestMedia: freshProcedure
    .requires("ai:manage")
    .input(requestAiMediaInput)
    .output(aiMediaSlot)
    .mutation(({ ctx, input }) => requestMedia(ctx, ctx.member, input)),

  /** Step two: it is stored, so the AI may send it. */
  confirmMedia: freshProcedure
    .requires("ai:manage")
    .input(confirmAiMediaInput)
    .mutation(({ ctx, input }) => confirmMedia(ctx, ctx.member, input)),

  updateMedia: freshProcedure
    .requires("ai:manage")
    .input(updateAiMediaInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => updateMedia(tx, ctx.member, input))),

  deleteMedia: freshProcedure
    .requires("ai:manage")
    .input(aiMediaIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteMedia(tx, ctx.member, input.mediaId)),
    ),

  /** A 5-minute link to look at one. */
  mediaLink: freshProcedure
    .requires("ai:manage")
    .input(aiMediaIdInput)
    .output(aiMediaLink)
    .query(({ ctx, input }) => mediaLink(ctx, ctx.member, input.mediaId)),

  /** The bookings the AI took on a lead, with the customer's payment proofs: only for a lead the member may see. */
  bookingsForLead: orgProcedure
    .requires("leads:view")
    .input(aiBookingsInput)
    .output(aiBookingList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const lead = await getLead(tx, ctx.member, input.leadId);
        return bookingsOfLead(tx, lead.id);
      }),
    ),

  /** The payment is in (the lead is won), the booking is off, or it waits for payment again. */
  setBookingStatus: freshProcedure
    .requires("leads:edit", "leads:view")
    .input(setAiBookingStatusInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const booking = await tx.aiBooking.findUnique({ where: { id: input.bookingId }, select: { leadId: true } });
        if (booking === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
        // A lead out of the member's scope is not found.
        await getLead(tx, ctx.member, booking.leadId);
        await setBookingStatus(tx, ctx.member, input, new Date());
      }),
    ),

  /** The AI's guess of how a lead will go, for its page: only for a lead the member may see. */
  leadInsight: orgProcedure
    .requires("ai:suggest", "leads:view")
    .input(leadInsightInput)
    .output(leadInsightAnswer)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const lead = await getLead(tx, ctx.member, input.leadId);
        return { insight: await leadInsightOf(tx, lead.id) };
      }),
    ),

  /** A draft reply for the chat, in the composer's box: never sent by itself. */
  suggestReply: orgProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(suggestReplyInput)
    .output(suggestedReply)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured) {
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      }
      const agencyName = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.name ?? "the agency";
      return suggestReply(ctx.db, ctx.ai, ctx.member, input, { agencyName, now: new Date() });
    }),

  /** The autopilot's settings: off until an Owner or Admin turns it on. */
  autopilot: freshProcedure
    .requires("ai:manage")
    .output(autopilotSettings)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => autopilotSettingsOf(tx))),

  saveAutopilot: freshProcedure
    .requires("ai:manage")
    .input(saveAutopilotInput)
    .output(autopilotSettings)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAutopilot(tx, ctx.member, input)),
    ),

  /** The autopilot's last day at a glance. */
  overview: freshProcedure
    .requires("ai:manage")
    .output(aiOverview)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => aiOverviewOf(tx, new Date()))),

  /** What it learned from the agency's chats, for the owner to turn off or dismiss. */
  learnings: freshProcedure
    .requires("ai:manage")
    .output(aiLearningList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listLearnings(tx))),

  setLearning: freshProcedure
    .requires("ai:manage")
    .input(setAiLearningInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => setLearning(tx, ctx.member, input))),

  learnNow: freshProcedure
    .requires("ai:manage")
    .output(aiLearnResult)
    .mutation(async ({ ctx }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      return learnNow({ db: ctx.db, ai: ctx.ai, agencyName }, ctx.member, new Date());
    }),

  /** Learns one staff member's way of talking from their own messages (the browser dropped the customer's side). */
  learnVoice: freshProcedure
    .requires("ai:manage")
    .input(learnVoiceInput)
    .output(aiVoice)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      return learnVoice({ db: ctx.db, ai: ctx.ai }, ctx.member, input, new Date());
    }),

  clearVoice: freshProcedure
    .requires("ai:manage")
    .mutation(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => clearVoice(tx, ctx.member))),

  /** A chat's autopilot state, for the inbox. */
  chatAi: orgProcedure
    .requires("ai:suggest", "inbox:view")
    .input(conversationAiInput)
    .output(chatAi)
    .query(async ({ ctx, input }) => {
      const allowed = aiAllowed(await ctx.subscriptions.entitlementsOf(ctx.member.organizationId));
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
        chatAiOf(tx, input.conversationId, ctx.ai?.configured === true && allowed && (await aiEnabled(tx))),
      );
    }),

  /** The AI on, off or as the agency says in one chat; turning it on gives a handed-over chat back. */
  setChatMode: freshProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(setChatAiInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => setChatMode(tx, ctx.member, input))),

  /** "Let AI answer now": a handed-over chat goes back to the AI. */
  resumeChat: freshProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(conversationAiInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => resumeChat(tx, ctx.member, input.conversationId)),
    ),

  setChatPersona: freshProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(setChatPersonaInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setChatPersona(tx, ctx.member, input)),
    ),

  /** Learns the way of talking in one chat from its imported export (both sides: the other side's words go too). */
  learnChatVoice: freshProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(learnChatVoiceInput)
    .output(aiVoice)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      return learnChatVoice({ db: ctx.db, ai: ctx.ai }, ctx.member, input, new Date());
    }),

  clearChatVoice: freshProcedure
    .requires("ai:suggest", "inbox:view", "inbox:reply")
    .input(clearChatVoiceInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => clearChatVoice(tx, ctx.member, input.conversationId)),
    ),

  /** The test box: what the AI would answer a question from the agency's knowledge alone. */
  test: freshProcedure
    .requires("ai:manage")
    .input(testAiInput)
    .output(testAiAnswer)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      return testAnswer({ db: ctx.db, ai: ctx.ai, agencyName }, ctx.member, input.question, new Date());
    }),
});
