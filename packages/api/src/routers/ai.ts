// ai.*: the AI sales agent (the owner's widening of ADR 0029, 2026-10-27). Its settings and knowledge, written by
// whoever manages settings; a chat's AI state, its switch and giving a handed-over chat back, for whoever answers chats;
// a suggested reply for them; a lead's insight for anyone who sees the lead; and a test question for settings.
import { z } from "zod";
import {
  aiDocumentSlot,
  aiKnowledgeIdInput,
  aiKnowledgeList,
  aiSettings,
  chatAi,
  confirmAiDocumentInput,
  conversationAiInput,
  createAiKnowledgeInput,
  leadInsight,
  leadInsightInput,
  requestAiDocumentInput,
  resumeChatAiInput,
  saveAiSettingsInput,
  setChatAiInput,
  suggestedReply,
  testAiAnswer,
  testAiInput,
  updateAiKnowledgeInput,
} from "@travel-crm/contracts/ai";
import {
  addKnowledge,
  aiSettingsOf,
  chatAiOf,
  confirmDocument,
  deleteKnowledge,
  leadInsightOf,
  listKnowledge,
  requestDocument,
  resumeChat,
  saveAiSettings,
  setChatMode,
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

export const aiRouter = router({
  settings: settingsReader.output(aiSettings).query(async ({ ctx }) => ({
    ...(await ctx.db.forOrg(ctx.member.organizationId, (tx) => aiSettingsOf(tx))),
    configured: ctx.ai.configured,
    models: { chat: [...ctx.ai.models.chat], fast: [...ctx.ai.models.fast] },
  })),

  saveSettings: settingsWriter
    .input(saveAiSettingsInput)
    .output(aiSettings)
    .mutation(async ({ ctx, input }) => ({
      ...(await ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAiSettings(tx, ctx.member, input))),
      configured: ctx.ai.configured,
      models: { chat: [...ctx.ai.models.chat], fast: [...ctx.ai.models.fast] },
    })),

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
