// The console's pause of the WhatsApp AI agent: for every agency, or for one.
import { z } from "zod";
import { agentSetupSteps } from "../ai/index.js";
import { recordId } from "../identity/index.js";

/** A pause in force: since when. */
export const agentPauseInfo = z.object({ since: z.iso.datetime() });

/** Whether the agent is paused for every agency. */
export const agentPauseState = z.object({ everyone: agentPauseInfo.nullable() });
export type AgentPauseState = z.infer<typeof agentPauseState>;

/** One agency's pauses: its own, and the one for every agency, which wins. */
export const organizationAgentPause = z.object({
  agency: agentPauseInfo.nullable(),
  everyone: agentPauseInfo.nullable(),
});
export type OrganizationAgentPause = z.infer<typeof organizationAgentPause>;

export const pauseEveryoneInput = z.strictObject({ paused: z.boolean() });
export type PauseEveryoneInput = z.infer<typeof pauseEveryoneInput>;

export const pauseOrganizationInput = z.strictObject({ organizationId: recordId, paused: z.boolean() });
export type PauseOrganizationInput = z.infer<typeof pauseOrganizationInput>;

export const organizationAgentPauseInput = z.strictObject({ organizationId: recordId });

/**
 * What the console reads of an agency's AI agent: whether the agency turned it on, the required setup steps still
 * undone, and whether it is ready to answer. A pause shows apart (organizationAgentPause).
 */
export const organizationAgentState = z.object({
  /** The AI module and the agency's own agent switch are on. */
  on: z.boolean(),
  /** The required setup steps not done, in the Setup tab's order. */
  missing: z.array(z.enum(agentSetupSteps)),
  /** On with every required step done. */
  answering: z.boolean(),
});
export type OrganizationAgentState = z.infer<typeof organizationAgentState>;

/** How many agencies "Resume one agency at a time" paused on their own. */
export const resumeOneAtATimeResult = z.object({ paused: z.int().min(0) });
export type ResumeOneAtATimeResult = z.infer<typeof resumeOneAtATimeResult>;
