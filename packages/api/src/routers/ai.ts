// ai.*: Suggest reply (ADR 0029; the owner's decision of 2026-10-28). Anyone who may reply in a chat and holds ai:suggest
// asks for a draft (a mutation: it spends one of the agency's suggestions); only whoever holds ai:manage, from a session
// read afresh, turns it on for the agency and writes its instructions and the documents package drafts read. The bookings the AI took show on
// the lead for anyone who sees it, and whoever may work the lead confirms or cancels one. The plan's AI module is checked
// on every call.
import {
  agencyAnswers,
  agentBasics,
  agentSetup,
  handedOverChatList,
  setAgentOnInput,
  linkAdInput,
  whatsappAds,
  saveAgencyAnswersInput,
  saveAgentBasicsInput,
  decideLeadAiFieldsInput,
  decideStageSuggestionInput,
  leadStageSuggestion,
  leadStageSuggestionInput,
  stageSuggestionList,
  leadAiFields,
  leadAiFieldsInput,
  addAiKnowledgeInput,
  aiBookingList,
  aiBookingsInput,
  setAiBookingStatusInput,
  aiDocumentSlot,
  aiOverview,
  chatAi,
  conversationAiInput,
  testAiAnswer,
  testAiInput,
  setChatAiInput,
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
  writeUp,
  writeUpInput,
} from "@travel-crm/contracts/ai";
import {
  agencyAnswersOf,
  agentBasicsOf,
  agentSetupOf,
  handedOverChatsOf,
  setAgentOn,
  saveAgencyAnswers,
  saveAgentBasics,
  decideSuggestions,
  suggestedFieldsOf,
  addKnowledge,
  aiAllowed,
  bookingsOfLead,
  setBookingStatus,
  aiEnabled,
  aiOverviewOf,
  aiSettingsOf,
  chatAiOf,
  liteDryRun,
  resumeChat,
  setChatMode,
  confirmDocument,
  deleteKnowledge,
  leadInsightOf,
  listKnowledge,
  requestDocument,
  saveAiSettings,
  decideStageSuggestion,
  stageSuggestionOfLead,
  stageSuggestionsOf,
  suggestReply,
  updateKnowledge,
  writeUpQuote,
} from "@travel-crm/domain/ai";
import { adPackageChoicesOf, adsOf, linkAd } from "@travel-crm/domain/inbox";
import { agentPauseOf } from "@travel-crm/domain/subscriptions";
import { getLead } from "@travel-crm/domain/crm";
import { DomainError } from "@travel-crm/domain/kernel";
import { agencyToday } from "../package-departures-gate.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { aiDeparturesRouter } from "./ai-departures.js";
import { aiFillRouter } from "./ai-fill.js";
import { aiPackageDraftsRouter } from "./ai-package-drafts.js";
import { aiRatesRouter } from "./ai-rates.js";
import { router } from "../trpc.js";

export const aiRouter = router({
  /** "Fill it for me": the AI proposes values for a form; a person applies and saves. */
  fill: aiFillRouter,

  /** AI on a departure: rooming requests read from notes, and personal messages that offer empty seats. */
  departures: aiDeparturesRouter,

  /** AI on a supplier's rates: a rate sheet read into rows to check and save. */
  rates: aiRatesRouter,

  /** AI on a group package: trips found in the agency's documents, one drafted with its evidence, and the owner's save. */
  packageDrafts: aiPackageDraftsRouter,

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

  /** The documents package drafts are written from. */
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

  /** The payment is in (the lead is won), the booking is off, or it waits for payment again; with bookings, confirmed on Payments to check. */
  setBookingStatus: freshProcedure
    .requires("leads:edit", "leads:view")
    .input(setAiBookingStatusInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const booking = await tx.aiBooking.findUnique({ where: { id: input.bookingId }, select: { leadId: true } });
        if (booking === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
        // A lead out of the member's scope is not found.
        await getLead(tx, ctx.member, booking.leadId);
        const bookingsOn = ctx.entitlements?.modules.has("bookings") === true;
        await setBookingStatus(tx, ctx.member, input, new Date(), { bookingsOn });
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

  /** What the AI filled in on a new lead from its first messages and a person has not confirmed: only for a lead the member may see. */
  leadFields: orgProcedure
    .requires("ai:suggest", "leads:view")
    .input(leadAiFieldsInput)
    .output(leadAiFields)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const lead = await getLead(tx, ctx.member, input.leadId);
        return { fields: await suggestedFieldsOf(tx, lead.id) };
      }),
    ),

  /** Confirm keeps what the AI filled in; dismiss clears what is still the AI's. */
  decideLeadFields: orgProcedure
    .requires("ai:suggest", "leads:edit")
    .input(decideLeadAiFieldsInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        // A lead out of the member's scope is "not found".
        const lead = await getLead(tx, ctx.member, input.leadId);
        await decideSuggestions(tx, ctx.member, lead.id, input.decision, input.fields);
      }),
    ),

  /** The AI's open suggestions to mark a lead Lost or Not a lead, in the member's leads scope: the "Needs you" list. */
  stageSuggestions: orgProcedure
    .requires("leads:view")
    .output(stageSuggestionList)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        suggestions: await stageSuggestionsOf(tx, ctx.member),
      })),
    ),

  /** The lead's open suggestion, for the alert on its page. */
  leadStageSuggestion: orgProcedure
    .requires("leads:view")
    .input(leadStageSuggestionInput)
    .output(leadStageSuggestion)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        suggestion: await stageSuggestionOfLead(tx, ctx.member, input.leadId),
      })),
    ),

  /** A person's yes or no to a suggestion; yes moves the lead as that person. */
  decideStageSuggestion: orgProcedure
    .requires("leads:edit")
    .input(decideStageSuggestionInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => decideStageSuggestion(tx, ctx.member, input, new Date())),
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

  /** A message for the customer about a quote, in the chosen language and for the chosen channel; never sent by itself. */
  writeUp: orgProcedure
    .requires("ai:suggest", "quotes:view")
    .input(writeUpInput)
    .output(writeUp)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured) {
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      }
      const agencyName = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.name ?? "the agency";
      return writeUpQuote(ctx.db, ctx.ai, ctx.member, input, { agencyName, now: new Date() });
    }),

  /** The ads that brought chats, newest first, and the package each promotes. */
  ads: freshProcedure
    .requires("ai:manage")
    .output(whatsappAds)
    .query(async ({ ctx }) => {
      const { ads, packages } = await ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        ads: await adsOf(tx),
        packages: await adPackageChoicesOf(tx),
      }));
      return { ads: ads.map((ad) => ({ ...ad, lastSeenAt: ad.lastSeenAt.toISOString() })), packages };
    }),

  linkAd: freshProcedure
    .requires("ai:manage")
    .input(linkAdInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => linkAd(tx, ctx.member, input))),

  /** The agency's answers to the fixed questions the AI agent quotes. */
  agencyAnswers: freshProcedure
    .requires("ai:manage")
    .output(agencyAnswers)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => agencyAnswersOf(tx))),

  saveAgencyAnswers: freshProcedure
    .requires("ai:manage")
    .input(saveAgencyAnswersInput)
    .output(agencyAnswers)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAgencyAnswers(tx, ctx.member, input)),
    ),

  /** The agent's name and tone. */
  agentBasics: freshProcedure
    .requires("ai:manage")
    .output(agentBasics)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => agentBasicsOf(tx))),

  saveAgentBasics: freshProcedure
    .requires("ai:manage")
    .input(saveAgentBasicsInput)
    .output(agentBasics)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveAgentBasics(tx, ctx.member, input)),
    ),

  /** The setup checklist and whether the agent is on. */
  agentSetup: freshProcedure
    .requires("ai:manage")
    .output(agentSetup)
    .query(async ({ ctx }) => {
      const today = await agencyToday(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => agentSetupOf(tx, ctx.member.organizationId, today));
    }),

  setAgentOn: freshProcedure
    .requires("ai:manage")
    .input(setAgentOnInput)
    .output(agentSetup)
    .mutation(async ({ ctx, input }) => {
      const today = await agencyToday(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => setAgentOn(tx, ctx.member, input.on, today));
    }),

  /** Chats the agent handed over to a person, among those this member's inbox shows. */
  handedOver: freshProcedure
    .requires("ai:manage", "inbox:view")
    .output(handedOverChatList)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => handedOverChatsOf(tx, ctx.member))),

  /** The autopilot's last day at a glance. */
  overview: freshProcedure
    .requires("ai:manage")
    .output(aiOverview)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => aiOverviewOf(tx, new Date()))),

  /** A chat's autopilot state, for the inbox. */
  chatAi: orgProcedure
    .requires("ai:suggest", "inbox:view")
    .input(conversationAiInput)
    .output(chatAi)
    .query(async ({ ctx, input }) => {
      const allowed = aiAllowed(ctx.entitlements);
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
        chatAiOf(
          tx,
          input.conversationId,
          // A pause by platform staff stops the answering too, read fresh (not from the access cache).
          ctx.ai?.configured === true &&
            allowed &&
            (await aiEnabled(tx)) &&
            (await agentPauseOf(tx, ctx.member.organizationId)) === null,
        ),
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

  /** Try it: the agent's turn as a dry run on one question, nothing sent or kept. */
  test: freshProcedure
    .requires("ai:manage")
    .input(testAiInput)
    .output(testAiAnswer)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      return liteDryRun({ db: ctx.db, ai: ctx.ai, agencyName }, ctx.member, input.question, new Date());
    }),
});
