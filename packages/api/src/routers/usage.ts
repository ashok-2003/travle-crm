// usage.*: what a member does in the product (the owner, 2026-10-28): each page opened and how long it stays open, for
// the platform console's analytics, and the welcome each member sees once. Every member, in every subscription state.
import {
  installedApps,
  installedAppSeenInput,
  trackedVisit,
  trackVisitInput,
  welcome,
} from "@travel-crm/contracts/usage";
import {
  installedAppPlatforms,
  markWelcomeSeen,
  recordInstalledAppVisit,
  trackVisit,
  welcomeOf,
} from "@travel-crm/domain/usage";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const anyMember = orgProcedure.meta({ planModule: "core", lifecycle: "always" });

export const usageRouter = router({
  /** A page opened, or still open with its seconds so far. */
  track: anyMember
    .meta({ keepsAccess: true })
    .input(trackVisitInput)
    .output(trackedVisit)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => trackVisit(tx, ctx.member, input))),

  welcome: anyMember
    .output(welcome)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => welcomeOf(tx, ctx.member))),

  /** The installed app was opened on this phone type (at most one write a day). */
  installedAppSeen: anyMember
    .meta({ keepsAccess: true })
    .input(installedAppSeenInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => recordInstalledAppVisit(tx, ctx.member, input.platform)),
    ),

  /** The phone types this member has opened the installed app on lately: the browser's cue to point to it. */
  installedApps: anyMember.output(installedApps).query(({ ctx }) =>
    ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
      platforms: await installedAppPlatforms(tx, ctx.member),
    })),
  ),

  welcomeSeen: anyMember
    .meta({ keepsAccess: true })
    .mutation(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => markWelcomeSeen(tx, ctx.member))),
});
