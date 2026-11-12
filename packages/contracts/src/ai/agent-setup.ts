// The AI agent's setup: the agency's answers to a fixed list of questions, and the agent's name and tone.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const agencyQuestionTopics = [
  "cancellation",
  "refunds",
  "id_documents",
  "safety",
  "children",
  "payment_methods",
] as const;
export type AgencyQuestionTopic = (typeof agencyQuestionTopics)[number];

export const agencyAnswers = z.partialRecord(z.enum(agencyQuestionTopics), z.string());
export type AgencyAnswers = z.infer<typeof agencyAnswers>;

export const saveAgencyAnswersInput = z.strictObject({
  answers: z.partialRecord(z.enum(agencyQuestionTopics), z.string().trim().max(500)),
});
export type SaveAgencyAnswersInput = z.infer<typeof saveAgencyAnswersInput>;

/** The two tones the page offers; the stored tone also keeps "enthusiastic" for the first agent. */
export const agentTones = ["friendly", "professional"] as const;

export const saveAgentBasicsInput = z.strictObject({
  agentName: z.string().trim().max(80),
  tone: z.enum(agentTones),
});
export type SaveAgentBasicsInput = z.infer<typeof saveAgentBasicsInput>;

export const agentBasics = z.object({
  agentName: z.string(),
  tone: z.enum(["friendly", "professional", "enthusiastic"]),
});
export type AgentBasics = z.infer<typeof agentBasics>;

/** An ad that brought WhatsApp chats, and the package it promotes (the agent opens a chat from it with that package). */
export const whatsappAd = z.object({
  id: z.uuid(),
  headline: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  packageId: z.uuid().nullable(),
  chats: z.number().int(),
  lastSeenAt: z.iso.datetime(),
});
export const whatsappAdList = z.array(whatsappAd);
export type WhatsappAd = z.infer<typeof whatsappAd>;

export const linkAdInput = z.strictObject({ adId: z.uuid(), packageId: z.uuid().nullable() });
export type LinkAdInput = z.infer<typeof linkAdInput>;

/** The checklist before the agent may be turned on; "ads" is the one step that is optional. */
export const agentSetupSteps = ["whatsapp", "packages", "payment", "answers", "basics", "ads"] as const;

export const agentSetup = z.object({
  steps: z.array(
    z.object({
      key: z.enum(agentSetupSteps),
      done: z.boolean(),
      optional: z.boolean(),
      count: z.int().nullable(),
      total: z.int().nullable(),
    }),
  ),
  /** Every step that isn't optional is done. */
  ready: z.boolean(),
  /** The autopilot switch. */
  on: z.boolean(),
  pausedBySupport: z.boolean(),
});
export type AgentSetup = z.infer<typeof agentSetup>;

export const setAgentOnInput = z.strictObject({ on: z.boolean() });
export type SetAgentOnInput = z.infer<typeof setAgentOnInput>;

/** A chat the agent handed over to a person, and why. */
export const handedOverChat = z.object({
  conversationId: recordId,
  name: z.string(),
  reason: z.string().nullable(),
  since: z.iso.datetime(),
});
export const handedOverChatList = z.array(handedOverChat);
export type HandedOverChat = z.infer<typeof handedOverChat>;
