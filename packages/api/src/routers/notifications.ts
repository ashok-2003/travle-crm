// notifications.*: the bell and each person's choice of what reaches them by email and push (spec 9.4), for every
// member: they are the person's own, so they need no permission. The bell's list and count are views like any other;
// marking read and the choices touch only the person's own rows, never the organization's records, so they work in
// every state of the subscription: an unsubscribe link must work whatever the organization has paid (DPDP).
import {
  listNotificationsInput,
  markReadInput,
  notificationPage,
  notificationPreference,
  notificationPreferenceInput,
} from "@travel-crm/contracts/notifications";
import {
  listNotifications,
  listPreferences,
  markRead,
  setPreference,
  unreadCount,
} from "@travel-crm/domain/notifications";
import { z } from "zod";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const person = orgProcedure.meta({ planModule: "core" });
/** The person's own rows, in every state of the subscription. */
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
});
