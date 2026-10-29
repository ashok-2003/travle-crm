// notifications.*: the bell, each person's choice of what reaches them by email and push, and their browsers' push
// subscriptions (spec 9.4), for every member: they are the person's own, so they need no permission. The bell's list
// and count are views like any other; marking read, the choices and the browsers touch only the person's own rows,
// never the organization's records, so they work in every state of the subscription: an unsubscribe link must work
// whatever the organization has paid (DPDP), and so must signing out, which removes this browser's subscription.
import {
  listNotificationsInput,
  markReadInput,
  morningSetting,
  morningSettingInput,
  notificationPage,
  notificationPreference,
  notificationPreferenceInput,
  pushSubscriptionInput,
  removePushSubscriptionInput,
} from "@travel-crm/contracts/notifications";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  getMorningSetting,
  listNotifications,
  listPreferences,
  markRead,
  removePushSubscription,
  saveMorningSetting,
  savePushSubscription,
  setPreference,
  unreadCount,
} from "@travel-crm/domain/notifications";
import { z } from "zod";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const person = orgProcedure.meta({ planModule: "core" });
/** The person's own rows, and what their browser needs to add one, in every state of the subscription. */
const ownRows = person.meta({ lifecycle: "always" });

const preferencesRouter = router({
  list: ownRows
    .output(z.array(notificationPreference))
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listPreferences(tx, ctx.member))),

  /** Refused to support impersonating the person (IMPERSONATING): consent is the person's own. */
  set: ownRows
    .input(notificationPreferenceInput)
    .output(notificationPreference)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setPreference(tx, ctx.member, input)),
    ),
});

const morningRouter = router({
  get: ownRows
    .output(morningSetting)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => getMorningSetting(tx, ctx.member))),

  /** Refused to support impersonating the person (IMPERSONATING): it is the person's own. */
  set: ownRows
    .input(morningSettingInput)
    .output(morningSetting)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveMorningSetting(tx, ctx.member, input)),
    ),
});

const pushRouter = router({
  /** The VAPID public key the browser subscribes with, from the api's settings: no key is built into the web app. */
  publicKey: ownRows.output(z.string()).query(({ ctx }) => ctx.pushPublicKey),

  /**
   * Saves this browser's subscription for the person: within the organization, a shared browser moves to whoever
   * subscribes last; across organizations, the web app drops the browser's subscription at every sign-in and sign-out,
   * and the push service's 404 or 410 then removes the old row. Refused to support impersonating them: the person's
   * pushes would reach support's browser.
   */
  subscribe: ownRows
    .input(pushSubscriptionInput)
    .use(({ ctx, next }) => {
      if (ctx.member.impersonatedBy !== null) {
        throw new DomainError("FORBIDDEN", "IMPERSONATING", "Only the person can subscribe their browser to push");
      }
      return next();
    })
    .mutation(async ({ ctx, input }) => {
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => savePushSubscription(tx, ctx.member, input));
    }),

  /** Removes this browser's subscription if it is the person's; another person's stays. */
  unsubscribe: ownRows.input(removePushSubscriptionInput).mutation(async ({ ctx, input }) => {
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => removePushSubscription(tx, ctx.member, input));
  }),
});

export const notificationsRouter = router({
  /** Newest first, a page at a time. */
  list: person
    .input(listNotificationsInput)
    .output(notificationPage)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listNotifications(tx, ctx.member, input)),
    ),

  unreadCount: person
    .output(z.number().int().nonnegative())
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => unreadCount(tx, ctx.member))),

  /** Returns how many were unread. Refused to support impersonating the person (IMPERSONATING). */
  markRead: ownRows
    .input(markReadInput)
    .output(z.number().int().nonnegative())
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => markRead(tx, ctx.member, input))),

  preferences: preferencesRouter,
  morning: morningRouter,
  push: pushRouter,
});
