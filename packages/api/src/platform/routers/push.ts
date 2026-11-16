// The console's web push (the owner, 2026-11-17): a super admin's browser subscribes to the platform's alerts, which the
// agencies' push (notifications.push) can't carry, since platform staff belong to no organization. Support is refused.
import { pushSubscriptionInput, removePushSubscriptionInput } from "@travel-crm/contracts/notifications";
import { removePlatformPushSubscription, savePlatformPushSubscription } from "@travel-crm/domain/platform";
import { z } from "zod";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const pushRouter = platformT.router({
  /** The VAPID public key the browser subscribes with, from the console's settings; empty when push is not set up. */
  publicKey: superAdminProcedure.output(z.string()).query(({ ctx }) => ctx.services.pushPublicKey ?? ""),
  /** Saves this browser for the super admin; a browser another person used moves to them. */
  subscribe: superAdminProcedure
    .input(pushSubscriptionInput)
    .mutation(({ ctx, input }) => savePlatformPushSubscription(ctx.services, ctx.staff, input)),
  /** Removes this browser if it is theirs. */
  unsubscribe: superAdminProcedure
    .input(removePushSubscriptionInput)
    .mutation(({ ctx, input }) => removePlatformPushSubscription(ctx.services, ctx.staff, input)),
});
