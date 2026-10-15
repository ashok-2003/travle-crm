// The organization's security settings: whether every member must use two-factor sign-in (spec 6.2).
import { securitySettings, setTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import { assertLifecycleAllows } from "@travel-crm/domain/subscriptions";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const settingsRouter = router({
  get: orgProcedure
    .meta({ planModule: "core" })
    .output(securitySettings)
    .query(({ ctx }) => ({ requireTwoFactor: ctx.member.organizationRequiresTwoFactor })),

  /**
   * Turning two-factor on shuts out whoever can't pass it, so like removing staff it works while read-only, and for
   * the Owner while suspended (ADR 0021). Turning it off loosens sign-in: check 2 again, now that the input says so,
   * as a change like any other.
   */
  setTwoFactorRequirement: freshProcedure
    .requires("settings:manage")
    .meta({ lifecycle: "revoke" })
    .input(setTwoFactorRequirementInput)
    .use(({ ctx, input, next }) => {
      if (!input.required) {
        assertLifecycleAllows(ctx.entitlements, { kind: "change", isOwner: ctx.member.role.isOwner });
      }
      return next();
    })
    .output(securitySettings)
    .mutation(({ ctx, input }) => ctx.identity.settings.setTwoFactorRequirement(ctx.member, input)),
});
