// subscription.get: what the member's organization's subscription allows today (spec 7.3), for the past-due banner
// and the modules the app shows, with no price. Open to every member in every state, so the app can say why the rest
// is refused; an organization without a subscription is refused as check 2 refuses everything else.
import { subscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "@travel-crm/domain/kernel";
import { overviewOf } from "@travel-crm/domain/subscriptions";
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
});
