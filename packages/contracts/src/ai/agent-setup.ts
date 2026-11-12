// The AI agent's setup: the agency's answers to a fixed list of questions, and the agent's name and tone.
import { z } from "zod";

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
