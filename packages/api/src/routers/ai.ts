// ai.*: the AI sales agent (the owner's widening of ADR 0029, 2026-10-27). Its settings and knowledge, written by
// whoever manages settings; a chat's AI state, its switch and giving a handed-over chat back, for whoever answers chats;
// a suggested reply for them; a lead's insight for anyone who sees the lead; a test question, the AI's day at a glance
// and what it learned (and learning now), for settings.
import { z } from "zod";
import {
  aiDocumentSlot,
  aiKnowledgeIdInput,
  aiKnowledgeList,
  aiLearnResult,
  aiLearningList,
  aiOverview,
  aiSettings,
  aiVoice,
  chatAi,
  clearVoiceInput,
  confirmAiDocumentInput,
  conversationAiInput,
  createAiKnowledgeInput,
  leadInsight,
  leadInsightInput,
  learnVoiceInput,
  requestAiDocumentInput,
  resumeChatAiInput,
  saveAiSettingsInput,
  setAiLearningInput,
  setChatAiInput,
  setChatPersonaInput,
  suggestedReply,
  testAiAnswer,
  testAiInput,
  updateAiKnowledgeInput,
} from "@travel-crm/contracts/ai";
import {
  addKnowledge,
  agencyVoiceOf,
  aiOverviewOf,
  aiSettingsOf,
  chatAiOf,
  clearVoice,
  confirmDocument,
  deleteKnowledge,
  learnNow,
  learnVoice,
  leadInsightOf,
  listKnowledge,
  listLearnings,
  requestDocument,
  resumeChat,
  saveAiSettings,
  setChatMode,
  setChatPersona,
  setLearning,
  suggestReply,
  testAnswer,
  updateKnowledge,
  type AiModel,
} from "@travel-crm/domain/ai";
import { scopeFilter, type Identity } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const settingsReader = orgProcedure.requires("settings:manage");
const settingsWriter = freshProcedure.requires("settings:manage");
const chatReader = orgProcedure.requires("inbox:view");
const chatSteerer = orgProcedure.requires("inbox:view", "inbox:reply");

const assistOf = (ctx: { db: Parameters<typeof suggestReply>[0]["db"]; ai: AiModel; identity: Identity }) => ({
  db: ctx.db,
  ai: ctx.ai,
  agencyName: async (organizationId: string) =>
    (await ctx.identity.organizationProfile(organizationId))?.name ?? "our team",
});

/** The settings as the screen reads them, with the platform's model and when the AI last learned. */
const settingsView = (
  row: Awaited<ReturnType<typeof aiSettingsOf>>,
  voice: Awaited<ReturnType<typeof agencyVoiceOf>>,
  ai: AiModel,
) => ({
  ...row,
  voice: voice === null ? null : { name: voice.name, profile: voice.profile, examples: voice.examples.length },
  learnedAt: row.learnedAt?.toISOString() ?? null,
  configured: ai.configured,
  models: { chat: [...ai.models.chat], fast: [...ai.models.fast] },
});

export const aiRouter = router({
  settings: settingsReader
    .output(aiSettings)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
        settingsView(await aiSettingsOf(tx), await agencyVoiceOf(tx), ctx.ai),
      ),
    ),

  saveSettings: settingsWriter
    .input(saveAiSettingsInput)
    .output(aiSettings)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
        settingsView(await saveAiSettings(tx, ctx.member, input), await agencyVoiceOf(tx), ctx.ai),
      ),
    ),

  /** The AI's last day at a glance. */
  overview: settingsReader
    .output(aiOverview)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => aiOverviewOf(tx, new Date()))),

  /** What the AI learned from the agency's chats. */
  learnings: settingsReader
    .output(aiLearningList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listLearnings(tx))),

  setLearning: settingsWriter
    .input(setAiLearningInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => setLearning(tx, ctx.member, input))),

  /** The agency's AI talks like one real person, from their own messages in a chat export. */
  learnVoice: settingsWriter
    .input(learnVoiceInput.omit({ conversationId: true }))
    .output(aiVoice)
    .mutation(({ ctx, input }) => learnVoice(assistOf(ctx), ctx.member, input)),

  clearVoice: settingsWriter.mutation(({ ctx }) =>
    ctx.db.forOrg(ctx.member.organizationId, (tx) => clearVoice(tx, ctx.member, undefined)),
  ),

  /** In one chat only, the AI talks like one real person. */
  learnChatVoice: chatSteerer
    .input(learnVoiceInput.required({ conversationId: true }))
    .output(aiVoice)
    .mutation(({ ctx, input }) => learnVoice(assistOf(ctx), ctx.member, input)),

  clearChatVoice: chatSteerer
    .input(clearVoiceInput.required({ conversationId: true }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => clearVoice(tx, ctx.member, input.conversationId)),
    ),

  /** Learn from the chats now, not waiting for the night. */
  learnNow: settingsWriter.output(aiLearnResult).mutation(({ ctx }) => learnNow(assistOf(ctx), ctx.member, new Date())),

  knowledge: settingsReader
    .output(aiKnowledgeList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listKnowledge(tx))),

  addKnowledge: settingsWriter
    .input(createAiKnowledgeInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => addKnowledge(tx, ctx.member, input)),
    ),

  updateKnowledge: settingsWriter
    .input(updateAiKnowledgeInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateKnowledge(tx, ctx.member, input)),
    ),

  deleteKnowledge: settingsWriter
    .input(aiKnowledgeIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteKnowledge(tx, ctx.member, input.knowledgeId)),
    ),

  /** Step one of a document: where the browser uploads it. */
  requestDocument: settingsWriter
    .input(requestAiDocumentInput)
    .output(aiDocumentSlot)
    .mutation(({ ctx, input }) => requestDocument({ db: ctx.db, files: ctx.files }, ctx.member, input)),

  /** Step two: it is stored; the worker reads its words. */
  confirmDocument: settingsWriter
    .input(confirmAiDocumentInput)
    .mutation(({ ctx, input }) => confirmDocument({ db: ctx.db, files: ctx.files }, ctx.member, input)),

  /** What the agent would answer a question, from the knowledge alone. */
  test: settingsWriter
    .input(testAiInput)
    .output(testAiAnswer)
    .mutation(({ ctx, input }) => testAnswer(assistOf(ctx), ctx.member, input.question)),

  /** A chat's AI state and its lead's insight, for the chat's panel. */
  forChat: chatReader
    .input(conversationAiInput)
    .output(chatAi)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => chatAiOf(tx, input.conversationId, ctx.ai.configured)),
    ),

  setChatMode: chatSteerer
    .input(setChatAiInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => setChatMode(tx, ctx.member, input))),

  /** In one chat, the AI is a sales agent, an everyday conversation, or as the agency says. */
  setChatPersona: chatSteerer
    .input(setChatPersonaInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setChatPersona(tx, ctx.member, input)),
    ),

  /** A chat the agent handed to a person goes back to it. */
  resume: chatSteerer
    .input(resumeChatAiInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => resumeChat(tx, ctx.member, input.conversationId)),
    ),

  /** A reply the agent would write now, for the person answering to edit. Nothing is sent. */
  suggest: chatSteerer
    .input(conversationAiInput)
    .output(suggestedReply)
    .mutation(({ ctx, input }) => suggestReply(assistOf(ctx), ctx.member, input.conversationId)),

  /** A lead's insight, for its page; a lead out of the member's scope is not found. */
  forLead: orgProcedure
    .requires("leads:view")
    .input(leadInsightInput)
    .output(z.object({ insight: leadInsight.nullable() }))
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, ...scopeFilter(ctx.member, "leads:view", "ownerUserId") },
          select: { id: true },
        });
        if (lead === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
        return { insight: await leadInsightOf(tx, lead.id) };
      }),
    ),
});
