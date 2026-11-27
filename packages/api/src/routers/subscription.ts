// subscription.get: what the member's organization's subscription allows today (spec 7.3), for the past-due banner
// and the modules the app shows, with no price. Open to every member in every state, so the app can say why the rest
// is refused; an organization without a subscription is refused as check 2 refuses everything else.
import { billingView, subscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "@travel-crm/domain/kernel";
import { monthlyAiLimitOf, usedThisMonth } from "@travel-crm/domain/ai";
import { bytesStored } from "@travel-crm/domain/files";
import { organizationTimeZone, seatsUsed } from "@travel-crm/domain/identity";
import { billingViewOf, overviewOf } from "@travel-crm/domain/subscriptions";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const subscriptionRouter = router({
  get: orgProcedure
    .meta({ lifecycle: "always", planModule: "core" })
    .output(subscriptionOverview)
    .query(({ ctx }) => {
      if (!ctx.entitlements) {
        throw new DomainError("FORBIDDEN", "NO_SUBSCRIPTION", "This organization has no subscription");
      }
      return overviewOf(ctx.entitlements);
    }),

  /** The Owner's Plan & billing page: the plan's limits and this month's use, and the payments recorded. */
  billing: orgProcedure
    .requires("billing:view")
    .output(billingView)
    .query(({ ctx }) => {
      const { entitlements } = ctx;
      if (!entitlements) {
        throw new DomainError("FORBIDDEN", "NO_SUBSCRIPTION", "This organization has no subscription");
      }
      const { organizationId } = ctx.member;
      return ctx.db.forOrg(organizationId, async (tx) => {
        const now = new Date();
        const timeZone = await organizationTimeZone(tx, organizationId);
        return billingViewOf(tx, entitlements, organizationId, {
          seats: await seatsUsed(tx, organizationId),
          aiCredits: { limit: await monthlyAiLimitOf(tx), used: await usedThisMonth(tx, now, timeZone) },
          storageUsedBytes: await bytesStored(tx, organizationId, now),
        });
      });
    }),
});
