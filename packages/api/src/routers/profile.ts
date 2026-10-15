// The organization's business profile and setup checklist (spec 7.1): what onboarding left for the Owner to complete.
// Bank details are in it, so seeing it needs settings:manage too, and saving it reads the session afresh.
import {
  organizationProfileDetails,
  saveOrganizationProfileInput,
  setupChecklist,
} from "@travel-crm/contracts/profile";
import { setupChecklistOf } from "@travel-crm/domain/profile";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const profileRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(organizationProfileDetails.nullable())
    .query(({ ctx }) => ctx.profiles.get(ctx.member.organizationId)),

  save: freshProcedure
    .requires("settings:manage")
    .input(saveOrganizationProfileInput)
    .output(organizationProfileDetails)
    .mutation(({ ctx, input }) => ctx.profiles.save(ctx.member, input)),

  checklist: orgProcedure
    .requires("settings:manage")
    .output(setupChecklist)
    .query(async ({ ctx }) => {
      const [profile, staff] = await Promise.all([
        ctx.profiles.get(ctx.member.organizationId),
        ctx.identity.staff.list(ctx.member),
      ]);
      return setupChecklistOf(profile, staff.length);
    }),
});
