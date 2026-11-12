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
