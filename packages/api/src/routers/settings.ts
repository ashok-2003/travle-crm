// The organization's security settings: whether every member must use two-factor sign-in (spec 6.2).
import { securitySettings, setTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const settingsRouter = router({
  get: orgProcedure
    .meta({ planModule: "core" })
    .output(securitySettings)
    .query(({ ctx }) => ({ requireTwoFactor: ctx.member.organizationRequiresTwoFactor })),

  setTwoFactorRequirement: freshProcedure
    .requires("settings:manage")
    .input(setTwoFactorRequirementInput)
    .output(securitySettings)
    .mutation(({ ctx, input }) => ctx.identity.settings.setTwoFactorRequirement(ctx.member, input)),
});
