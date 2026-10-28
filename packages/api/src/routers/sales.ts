// sales.*: sales execution (the owner's focus of 2026-10-27): the hot leads to call now and one lead's heat, for anyone
// who sees leads.
import { z } from "zod";
import { hotLeadList, hotReason, leadIdOnlyInput } from "@travel-crm/contracts/sales";
import { hotLeadsOf, leadHeatOf } from "@travel-crm/domain/sales";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const leadViewer = orgProcedure.requires("leads:view");

export const salesRouter = router({
  /** The hot leads to call now, hottest first. */
  hotLeads: leadViewer
    .output(hotLeadList)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => hotLeadsOf(tx, ctx.member, { now: new Date() })),
    ),

  /** One lead's heat, for its page. */
  forLead: leadViewer
    .input(leadIdOnlyInput)
    .output(z.object({ heat: z.object({ score: z.int(), reasons: z.array(hotReason) }) }))
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        heat: await leadHeatOf(tx, ctx.member, { now: new Date(), leadId: input.leadId }),
      })),
    ),
});
