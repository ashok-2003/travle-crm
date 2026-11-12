// The console's pause of the WhatsApp AI agent, and its lite-agent switch: platform staff read it, only a super admin changes it.
import {
  agentPauseState,
  organizationAgentPause,
  organizationAgentPauseInput,
  organizationLiteAgent,
  pauseEveryoneInput,
  pauseOrganizationInput,
  setLiteAgentInput,
} from "@travel-crm/contracts/platform";
import * as domain from "@travel-crm/domain/platform";
import { staffProcedure, superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const aiAgentRouter = platformT.router({
  /** Whether the agent is paused for every agency. */
  pauseState: staffProcedure.output(agentPauseState).query(({ ctx }) => domain.agentPauseState(ctx.services)),
  /** One agency's pauses: its own and the one for every agency. */
  organizationPause: staffProcedure
    .input(organizationAgentPauseInput)
    .output(organizationAgentPause)
    .query(({ ctx, input }) => domain.organizationAgentPause(ctx.services, input.organizationId)),
  pauseEveryone: superAdminProcedure
    .input(pauseEveryoneInput)
    .output(agentPauseState)
    .mutation(({ ctx, input }) => domain.pauseEveryone(ctx.services, ctx.staff, input)),
  pauseOrganization: superAdminProcedure
    .input(pauseOrganizationInput)
    .output(organizationAgentPause)
    .mutation(({ ctx, input }) => domain.pauseOrganization(ctx.services, ctx.staff, input)),
  /** Whether the lite agent answers one agency's chats. */
  liteAgent: staffProcedure
    .input(organizationAgentPauseInput)
    .output(organizationLiteAgent)
    .query(({ ctx, input }) => domain.organizationLiteAgent(ctx.services, input.organizationId)),
  setLiteAgent: superAdminProcedure
    .input(setLiteAgentInput)
    .output(organizationLiteAgent)
    .mutation(({ ctx, input }) => domain.setOrganizationLiteAgent(ctx.services, ctx.staff, input)),
});
