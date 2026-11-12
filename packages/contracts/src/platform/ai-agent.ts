// The console's pause of the WhatsApp AI agent: for every agency, or for one.
import { z } from "zod";
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

/** Whether the lite agent answers this agency's chats (the console's switch; the AI module's own switch is separate). */
export const organizationLiteAgent = z.object({ lite: z.boolean() });
export type OrganizationLiteAgent = z.infer<typeof organizationLiteAgent>;

export const setLiteAgentInput = z.strictObject({ organizationId: recordId, lite: z.boolean() });
export type SetLiteAgentInput = z.infer<typeof setLiteAgentInput>;
