// The console's organizations (spec 7.1): onboarding one, showing one and its members, correcting its row, and sending
// its Owner a new invite. Platform staff of either level.
import {
  onboardedOrganization,
  onboardOrganizationInput,
  organizationDetails,
  organizationMember,
  organizationRecord,
  resendInviteInput,
  updateOrganizationInput,
} from "@travel-crm/contracts/platform";
import { organizationIdInput } from "@travel-crm/contracts/subscriptions";
import {
  getOrganization,
  listOrganizationMembers,
  onboardOrganization,
  resendInvite,
  updateOrganization,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { staffProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const organizationsRouter = platformT.router({
  onboard: staffProcedure
    .input(onboardOrganizationInput)
    .output(onboardedOrganization)
    .mutation(({ ctx, input }) => onboardOrganization(ctx.services, ctx.staff, input)),
  get: staffProcedure
    .input(organizationIdInput)
    .output(organizationDetails)
    .query(({ ctx, input }) => getOrganization(ctx.services, input.organizationId)),
  /** Its active members, oldest first: whom support may impersonate, and an Owner still to choose a password. */
  members: staffProcedure
    .input(organizationIdInput)
    .output(z.array(organizationMember))
    .query(({ ctx, input }) => listOrganizationMembers(ctx.services, input.organizationId)),
  update: staffProcedure
    .input(updateOrganizationInput)
    .output(organizationRecord)
    .mutation(({ ctx, input }) => updateOrganization(ctx.services, ctx.staff, input)),
  resendInvite: staffProcedure
    .input(resendInviteInput)
    .mutation(({ ctx, input }) => resendInvite(ctx.services, ctx.staff, input)),
});
