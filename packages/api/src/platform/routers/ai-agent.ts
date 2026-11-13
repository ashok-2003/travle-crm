// The console's pause of the WhatsApp AI agent, and its setup state: platform staff read it, only a super admin changes it.
import {
  agentPauseState,
  organizationAgentPause,
  organizationAgentPauseInput,
  organizationAgentState,
  pauseEveryoneInput,
  pauseOrganizationInput,
  resumeOneAtATimeResult,
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
  /** Whether one agency has its AI agent on, which setup steps are missing, and whether it can answer. */
  agentState: staffProcedure
    .input(organizationAgentPauseInput)
    .output(organizationAgentState)
    .query(({ ctx, input }) => domain.organizationAgentState(ctx.services, input.organizationId)),
  /** Pauses each agency on its own, then lifts the every-agency pause. */
  resumeOneAtATime: superAdminProcedure
    .output(resumeOneAtATimeResult)
    .mutation(({ ctx }) => domain.resumeOneAtATime(ctx.services, ctx.staff)),
});
