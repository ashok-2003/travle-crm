// ai.*: Suggest reply (ADR 0029; the owner's decision of 2026-10-28). Anyone who may reply in a chat and holds ai:suggest
// asks for a draft (a mutation: it spends one of the agency's suggestions); only whoever holds ai:manage, from a session
// read afresh, turns it on for the agency and writes its instructions. The plan's AI module is checked on every call.
import { aiSettings, aiStatus, saveAiSettingsInput, suggestedReply, suggestReplyInput } from "@travel-crm/contracts/ai";
import { aiEnabled, aiSettingsOf, saveAiSettings, suggestReply } from "@travel-crm/domain/ai";
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
});
