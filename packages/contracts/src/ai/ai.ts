// Suggest reply (ADR 0029; the owner's decision of 2026-10-28): an agency's own switch and instructions for the AI, and the
// one thing it does: draft a reply in a chat for a member to read, change and send. It never sends by itself.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const AI_INSTRUCTIONS_MAX = 1500;

/** What an Owner or Admin sets. Off until they turn it on. */
export const saveAiSettingsInput = z.strictObject({
  enabled: z.boolean(),
  /** What the agency tells its AI: its tone and language, what to offer, what never to say. */
  instructions: z.string().trim().max(AI_INSTRUCTIONS_MAX),
});
export type SaveAiSettingsInput = z.infer<typeof saveAiSettingsInput>;

export const aiSettings = z.object({
  enabled: z.boolean(),
  instructions: z.string(),
  /** False when this server has no AI key: the switch can be on but no suggestion is made, and the screen says so. */
  providerReady: z.boolean(),
  /** Suggestions an agency may make a month, and how many it has made this month. */
  monthlyLimit: z.int(),
  usedThisMonth: z.int(),
});
export type AiSettings = z.infer<typeof aiSettings>;

/** What the composer needs to know: whether to offer Suggest reply at all. */
export const aiStatus = z.object({ enabled: z.boolean() });

export const suggestReplyInput = z.strictObject({ conversationId: recordId });
export type SuggestReplyInput = z.infer<typeof suggestReplyInput>;

export const suggestedReply = z.object({
  /** Quoted back when the reply is sent, so the send is audited as drafted by AI. */
  draftId: recordId,
  text: z.string(),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type SuggestedReply = z.infer<typeof suggestedReply>;
