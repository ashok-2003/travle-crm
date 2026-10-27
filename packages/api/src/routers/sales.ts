// sales.*: sales execution (the owner's focus of 2026-10-27): the agency's automation (the first WhatsApp to a new lead,
// follow-ups, payment reminders, what makes a lead hot), written by whoever manages settings from a fresh session; the
// hot leads to call now and one lead's heat and follow-ups, for anyone who sees leads; stopping or restarting a lead's
// follow-ups, for whoever may change it.
import { z } from "zod";
import {
  hotLeadList,
  hotReason,
  leadCadence,
  leadIdOnlyInput,
  salesAutomation,
  saveSalesAutomationInput,
} from "@travel-crm/contracts/sales";
import { recordId } from "@travel-crm/contracts/identity";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import {
  hotLeadsOf,
  leadCadenceOf,
  leadHeatOf,
  salesAutomationOf,
  saveSalesAutomation,
  setFollowUps,
} from "@travel-crm/domain/sales";
import type { Identity } from "@travel-crm/domain/identity";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const leadViewer = orgProcedure.requires("leads:view");
const leadEditor = orgProcedure.requires("leads:view", "leads:edit");

const timeZoneOf = async (identity: Identity, organizationId: string) =>
  (await identity.organizationProfile(organizationId))?.timeZone ?? "Asia/Kolkata";

export const salesRouter = router({
  settings: orgProcedure
    .requires("settings:manage")
    .output(salesAutomation)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => salesAutomationOf(tx))),

  saveSettings: freshProcedure
    .requires("settings:manage")
    .input(saveSalesAutomationInput)
    .output(salesAutomation)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveSalesAutomation(tx, ctx.member, input)),
    ),

  /** The hot leads to call now, hottest first. */
  hotLeads: leadViewer.output(hotLeadList).query(async ({ ctx }) => {
    const now = new Date();
    const today = calendarDateIn(now, await timeZoneOf(ctx.identity, ctx.member.organizationId));
    return ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
      hotLeadsOf(tx, ctx.member, await salesAutomationOf(tx), { now, today }),
    );
  }),

  /** One lead's heat and its follow-ups, for its page. */
  forLead: leadViewer
    .input(leadIdOnlyInput)
    .output(
      z.object({
        heat: z.object({ score: z.int(), reasons: z.array(hotReason) }),
        cadence: leadCadence.nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const today = calendarDateIn(now, await timeZoneOf(ctx.identity, ctx.member.organizationId));
      return ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        heat: await leadHeatOf(tx, ctx.member, await salesAutomationOf(tx), { now, today, leadId: input.leadId }),
        cadence: await leadCadenceOf(tx, ctx.member, input.leadId),
      }));
    }),

  /** Stops a lead's follow-ups (spoke on the phone), or starts them again from the next one. */
  setFollowUps: leadEditor
    .input(z.strictObject({ leadId: recordId, on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const timeZone = await timeZoneOf(ctx.identity, ctx.member.organizationId);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        setFollowUps(tx, ctx.member, input, new Date(), timeZone),
      );
    }),
});
