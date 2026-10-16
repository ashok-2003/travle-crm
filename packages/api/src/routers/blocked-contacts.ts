// blockedContacts.*: the contacts blocked from leads, listed and unblocked in Settings (spec 3.6). Both need
// leads:assign (R17), as blocking does.
import { blockedContactsInput, blockedContactsPage, unblockContactInput } from "@travel-crm/contracts/crm";
import { listBlockedContacts, unblockContact } from "@travel-crm/domain/crm";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const assigner = orgProcedure.requires("leads:assign");

export const blockedContactsRouter = router({
  /** Newest first, with who blocked each. */
  list: assigner
    .input(blockedContactsInput)
    .output(blockedContactsPage)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const page = await ctx.db.forOrg(organizationId, (tx) => listBlockedContacts(tx, input));
      const people = await memberNames(
        ctx.identity,
        organizationId,
        page.items.map((item) => item.blockedBy),
      );
      return { ...page, people };
    }),

  unblock: assigner
    .input(unblockContactInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => unblockContact(tx, ctx.member, input)),
    ),
});
