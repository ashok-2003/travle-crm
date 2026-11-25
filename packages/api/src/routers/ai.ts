// ai.*: Suggest reply (ADR 0029; the owner's decision of 2026-10-28). Anyone who may reply in a chat and holds ai:suggest
// asks for a draft (a mutation: it spends one of the agency's suggestions); only whoever holds ai:manage, from a session
// read afresh, turns it on for the agency, sets up its WhatsApp agent and adds the documents package drafts read. The
// bookings the AI took show on the lead for anyone who sees it, and whoever may work the lead confirms or cancels one.
// The plan's AI module is checked on every call.
import {
  agencyAnswers,
  agentBasics,
  agentSetup,
  chatsAnswered,
  chatsAnsweredInput,
  handedOverChatList,
  setAgentOnInput,
  setNumberAnswersInput,
  linkAdInput,
  whatsappAds,
  saveAgencyAnswersInput,
  saveAgentBasicsInput,
  decideLeadAiFieldsInput,
  decideStageSuggestionInput,
  leadStageSuggestion,
  leadStageSuggestionInput,
  needsMeInput,
  stageSuggestionList,
  leadAiFields,
  leadAiFieldsInput,
  addAiKnowledgeInput,
  aiBookingList,
  aiBookingsInput,
  setAiBookingStatusInput,
  aiDocumentSlot,
  aiOverview,
  type AgentKind,
  chatAi,
  conversationAiInput,
  naturalTestAnswer,
  naturalTestInput,
  oneTestInput,
  testAiAnswer,
  testAgentAnswer,
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
  countHandedOver,
  handedOverChatsOf,
  setAgentOn,
  saveAgencyAnswers,
  saveAgentBasics,
  decideSuggestions,
  suggestedFieldsOf,
  addKnowledge,
  agentOf,
  aiAllowed,
  bookingsOfLead,
  setBookingStatus,
  aiEnabled,
  aiOverviewOf,
  chatsAnsweredSince,
  aiSettingsOf,
  chatAiOf,
  naturalPromptOf,
  naturalTryItTurn,
  onePromptOf,
  oneTryItTurn,
  tryItTurn,
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
  countOpenSuggestions,
  stageSuggestionsOf,
  suggestReply,
  updateKnowledge,
  writeUpQuote,
} from "@travel-crm/domain/ai";
import { adPackageChoicesOf, adsOf, linkAd, setNumberAnswers } from "@travel-crm/domain/inbox";
import { agentPauseOf } from "@travel-crm/domain/subscriptions";
import { getLead } from "@travel-crm/domain/crm";
import { organizationTimeZone } from "@travel-crm/domain/identity";
import { DomainError, periodStart } from "@travel-crm/domain/kernel";
import type { Database } from "@travel-crm/db";
import { agencyToday } from "../package-departures-gate.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { aiDeparturesRouter } from "./ai-departures.js";
import { aiFillRouter } from "./ai-fill.js";
import { aiPackageChangesRouter } from "./ai-package-changes.js";
import { aiPackageDraftsRouter } from "./ai-package-drafts.js";
import { aiRatesRouter } from "./ai-rates.js";
import { router } from "../trpc.js";

/** Try it runs the agency's own agent, as its setting says: a procedure for another agent's turn is refused. */
async function assertOwnAgent(
  ctx: { db: Database; member: { organizationId: string } },
  agent: AgentKind,
): Promise<void> {
  if ((await ctx.db.forOrg(ctx.member.organizationId, (tx) => agentOf(tx))) !== agent)
    throw new DomainError("CONFLICT", "AGENT_CHANGED", "The agency's agent is not the one this chat tests");
}

export const aiRouter = router({
  /** "Fill it for me": the AI proposes values for a form; a person applies and saves. */
  fill: aiFillRouter,

  /** AI on a departure: rooming requests read from notes, and personal messages that offer empty seats. */
  departures: aiDeparturesRouter,

  /** AI on a supplier's rates: a rate sheet read into rows to check and save. */
  rates: aiRatesRouter,

  /** AI on a group package: trips found in the agency's documents, one drafted with its evidence, and the owner's save. */
  packageDrafts: aiPackageDraftsRouter,

  /** AI on one trip: what changed, from the agency's words, photos or PDF, proposed, applied in one go and undone. */
  packageChanges: aiPackageChangesRouter,

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
    .input(needsMeInput)
    .output(stageSuggestionList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        suggestions: await stageSuggestionsOf(tx, ctx.member, input),
        total: await countOpenSuggestions(tx, ctx.member, input),
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

  /** One WhatsApp number's AI on or off, under the agency's switch; the setup again, with the numbers. */
  setNumberAnswers: freshProcedure
    .requires("ai:manage")
    .input(setNumberAnswersInput)
    .output(agentSetup)
    .mutation(async ({ ctx, input }) => {
      const today = await agencyToday(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        await setNumberAnswers(tx, ctx.member, input);
        return agentSetupOf(tx, ctx.member.organizationId, today);
      });
    }),

  /** Chats the agent handed over to a person: the member's own (`mine`), or all their inbox shows (AI managers only). */
  handedOver: freshProcedure
    .requires("inbox:view")
    .input(needsMeInput)
    .output(handedOverChatList)
    .query(({ ctx, input }) => {
      if (!input.mine && !ctx.member.permissions.has("ai:manage")) {
        throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires ai:manage");
      }
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        chats: await handedOverChatsOf(tx, ctx.member, input),
        total: await countHandedOver(tx, ctx.member, input),
      }));
    }),

  /** The autopilot's last day at a glance. */
  overview: freshProcedure
    .requires("ai:manage")
    .output(aiOverview)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => aiOverviewOf(tx, new Date()))),

  /** How many chats the AI answered in a period, in the agency's time zone. */
  chatsAnswered: freshProcedure
    .requires("ai:manage")
    .input(chatsAnsweredInput)
    .output(chatsAnswered)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const timeZone = await organizationTimeZone(tx, ctx.member.organizationId);
        return { chats: await chatsAnsweredSince(tx, periodStart(input.period, new Date(), timeZone)) };
      }),
    ),

  /** A chat's autopilot state, for the inbox. */
  chatAi: orgProcedure
    .requires("ai:suggest", "inbox:view")
    .input(conversationAiInput)
    .output(chatAi)
    .query(async ({ ctx, input }) => {
      const allowed = aiAllowed(ctx.entitlements);
      const { organizationId } = ctx.member;
      return ctx.db.forOrg(organizationId, async (tx) =>
        chatAiOf(tx, {
          organizationId,
          conversationId: input.conversationId,
          // A pause by platform staff stops the answering too, read fresh (not from the access cache).
          available:
            ctx.ai?.configured === true &&
            allowed &&
            (await aiEnabled(tx)) &&
            (await agentPauseOf(tx, organizationId)) === null,
          now: new Date(),
        }),
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

  /** Which agent Try it runs: the agency's own, so the screen knows which turn to ask for. */
  testAgent: freshProcedure
    .requires("ai:manage")
    .output(testAgentAnswer)
    .query(async ({ ctx }) => ({
      agent: await ctx.db.forOrg(ctx.member.organizationId, (tx) => agentOf(tx)),
    })),

  /**
   * Try it, on the lite agent: the agent's turn as a dry run on a test chat and the state its last turn left, nothing
   * sent or kept. It runs with the live settings (the live model list, no temperature); the owner chooses nothing.
   */
  test: freshProcedure
    .requires("ai:manage")
    .input(testAiInput)
    .output(testAiAnswer)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      await assertOwnAgent(ctx, "lite");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      const chat = { messages: input.messages, state: input.state };
      // One traced turn of the person's test chat, when the server traces (Langfuse).
      const tracing = ctx.tracing === undefined ? {} : { tracing: ctx.tracing };
      return tryItTurn({ db: ctx.db, ai: ctx.ai, agencyName, ...tracing }, ctx.member, chat, new Date());
    }),

  /**
   * Try it on the natural agent: its own strict input and answer, on the live prompt (label production). A server with
   * no model for the agent answers AI_NOT_READY; any other model failure comes back as nothing sent and a task, as it
   * would live. Nothing is sent or kept but the month's AI calls. When the server traces (Langfuse), each turn is one
   * traced turn of the test chat, its session the chat's id.
   */
  testNatural: freshProcedure
    .requires("ai:manage")
    .input(naturalTestInput)
    .output(naturalTestAnswer)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      await assertOwnAgent(ctx, "natural");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      const chat = {
        messages: input.messages,
        state: input.state,
        prompt: await naturalPromptOf(ctx.prompts),
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      };
      const tracing = ctx.tracing === undefined ? {} : { tracing: ctx.tracing };
      return naturalTryItTurn({ db: ctx.db, ai: ctx.ai, agencyName, ...tracing }, ctx.member, chat, new Date());
    }),

  /**
   * Try it on the one agent: the live prompt (label production), AI_NOT_READY without a model or a tool agent.
   * Nothing is sent or kept.
   */
  testOne: freshProcedure
    .requires("ai:manage")
    .input(oneTestInput)
    .output(naturalTestAnswer)
    .mutation(async ({ ctx, input }) => {
      const { ai, toolAgent } = ctx;
      if (!ai?.configured || toolAgent === undefined)
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      await assertOwnAgent(ctx, "one");
      const agencyName = async (organizationId: string) =>
        (await ctx.identity.organizationProfile(organizationId))?.name ?? "the agency";
      const chat = {
        messages: input.messages,
        state: input.state,
        prompt: await onePromptOf(ctx.prompts),
        ...(input.tap === undefined ? {} : { tap: input.tap }),
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      };
      const tracing = ctx.tracing === undefined ? {} : { tracing: ctx.tracing };
      return oneTryItTurn({ db: ctx.db, ai, toolAgent, agencyName, ...tracing }, ctx.member, chat, new Date());
    }),
});
