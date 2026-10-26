// broadcasts.*: one approved template to the chats with some tags (sales inbox spec 6, rebuilt 2026-10-26). For the Owner and
// Admins (inbox:templates) and through a fresh session, since it writes to many customers. The agency sees counts and its
// monthly allowance, never rupees: the platform pays Meta.
import {
  broadcastCreated,
  broadcastDetail,
  broadcastDetailInput,
  broadcastIdInput,
  broadcastList,
  broadcastPreview,
  broadcastPreviewInput,
  createBroadcastInput,
} from "@travel-crm/contracts/inbox";
import {
  broadcastDetailOf,
  cancelBroadcast,
  createBroadcast,
  listBroadcasts,
  previewBroadcast,
  resumeBroadcast,
} from "@travel-crm/domain/inbox";
import { memberNames } from "../member-names.js";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const writer = freshProcedure.requires("inbox:view", "inbox:templates");

export const broadcastsRouter = router({
  /** The newest broadcasts with their live counts. */
  list: writer.output(broadcastList).query(async ({ ctx }) => {
    const { items } = await ctx.db.forOrg(ctx.member.organizationId, (tx) => listBroadcasts(tx));
    const people = await memberNames(
      ctx.identity,
      ctx.member.organizationId,
      items.map((item) => item.createdBy),
    );
    return { items, people };
  }),

  /** One broadcast and a page of its recipients with where each stands. */
  get: writer
    .input(broadcastDetailInput)
    .output(broadcastDetail)
    .query(async ({ ctx, input }) => {
      const detail = await ctx.db.forOrg(ctx.member.organizationId, (tx) => broadcastDetailOf(tx, input, new Date()));
      const people = await memberNames(ctx.identity, ctx.member.organizationId, [detail.broadcast.createdBy]);
      return { ...detail, people };
    }),

  /** Who it would reach, who is left out and why, and what is left of the month's allowance. Changes nothing. */
  preview: writer
    .input(broadcastPreviewInput)
    .output(broadcastPreview)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => previewBroadcast(tx, ctx.member, input, new Date())),
    ),

  /** Confirms: the audience becomes recipients and the worker sends. The same request id is the same broadcast. */
  create: writer
    .input(createBroadcastInput)
    .output(broadcastCreated)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createBroadcast(tx, ctx.member, input, new Date())),
    ),

  cancel: writer
    .input(broadcastIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => cancelBroadcast(tx, ctx.member, input, new Date())),
    ),

  resume: writer
    .input(broadcastIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => resumeBroadcast(tx, ctx.member, input)),
    ),
});
