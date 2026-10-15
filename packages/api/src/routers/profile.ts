// The organization's business profile, branding and setup checklist (spec 7.1), served as organization.profile,
// organization.branding and organization.setup. Bank details are in the profile, so every procedure needs
// settings:manage, and saving reads the session afresh. Branding and the checklist carry no account number.
import {
  brandingDetails,
  businessProfileDetails,
  saveBrandingInput,
  setupChecklist,
  updateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";
import { setupChecklistOf } from "@travel-crm/domain/profile";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const profileRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(businessProfileDetails.nullable())
    .query(({ ctx }) => ctx.profiles.get(ctx.member.organizationId)),

  update: freshProcedure
    .requires("settings:manage")
    .input(updateOrganizationProfileInput)
    .output(businessProfileDetails)
    .mutation(({ ctx, input }) => ctx.profiles.update(ctx.member, input)),
});

const brandingRouter = router({
  get: orgProcedure
    .requires("settings:manage")
    .output(brandingDetails.nullable())
    .query(({ ctx }) => ctx.profiles.get(ctx.member.organizationId)),

  update: freshProcedure
    .requires("settings:manage")
    .input(saveBrandingInput)
    .output(brandingDetails)
    .mutation(({ ctx, input }) => ctx.profiles.saveBranding(ctx.member, input)),
});

const setupRouter = router({
  get: orgProcedure
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

export const organizationRouter = router({
  profile: profileRouter,
  branding: brandingRouter,
  setup: setupRouter,
});
