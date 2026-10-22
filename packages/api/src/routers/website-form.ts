// websiteForm.*: the agency's enquiry form (website form spec 3, 8). Everything needs leads:create and settings:manage (the
// first puts it on the crm plan module). Turning off and changing the link take a door away from visitors, so, like removing
// staff, they work while the agency is read-only and, for the Owner, while suspended (ADR 0021).
import { features } from "@travel-crm/contracts/features";
import { formCountsView, publicForm, saveWebsiteFormInput, websiteFormView } from "@travel-crm/contracts/website-forms";
import { DomainError } from "@travel-crm/domain/kernel";
import { isOnDemoPlan } from "@travel-crm/domain/subscriptions";
import {
  assertHasOwner,
  changeWebsiteFormLink,
  formCounts,
  readWebsiteForm,
  saveWebsiteForm,
  setWebsiteFormEnabled,
} from "@travel-crm/domain/website-forms";
import type { Context } from "../context.js";
import { orgProcedure } from "../procedures.js";
import { PREVIEW_TOKEN, publicFormOf } from "../public-form.js";
import { router } from "../trpc.js";
import { viewOf } from "../website-form-view.js";

const manager = orgProcedure.requires("leads:create", "settings:manage");

/** The offers tickbox is behind the consent switch (spec 0.1.2): while it is off, saving or previewing one is refused. */
function assertOffersAllowed(input: { offersTickbox: boolean }): void {
  if (input.offersTickbox && !features.marketingConsent) {
    throw new DomainError("VALIDATION", "FORM_OFFERS_NOT_AVAILABLE", "The offers tickbox is not available yet");
  }
}

const viewFor = (ctx: Context & { member: { organizationId: string } }) =>
  viewOf(ctx, { organizationId: ctx.member.organizationId, appUrl: ctx.appUrl, now: new Date() });

export const websiteFormRouter = router({
  /** The form, or its defaults before the first save; names why it is closed. Writes nothing. */
  get: manager.output(websiteFormView).query(({ ctx }) => viewFor(ctx)),

  save: manager
    .input(saveWebsiteFormInput)
    .output(websiteFormView)
    .mutation(async ({ ctx, input }) => {
      assertOffersAllowed(input);
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => saveWebsiteForm(tx, ctx.member, input));
      return viewFor(ctx);
    }),

  turnOn: manager.output(websiteFormView).mutation(async ({ ctx }) => {
    const { organizationId } = ctx.member;
    assertHasOwner(await ctx.identity.firstOwner(organizationId));
    await ctx.db.forOrg(organizationId, async (tx) => {
      // The shared demo never takes enquiries (F14).
      if (await isOnDemoPlan(tx, organizationId)) {
        throw new DomainError("FORBIDDEN", "FORM_UNAVAILABLE", "The demo takes no enquiries");
      }
      await setWebsiteFormEnabled(tx, ctx.member, true);
    });
    return viewFor(ctx);
  }),

  turnOff: manager
    .meta({ lifecycle: "revoke" })
    .output(websiteFormView)
    .mutation(async ({ ctx }) => {
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => setWebsiteFormEnabled(tx, ctx.member, false));
      return viewFor(ctx);
    }),

  /** A new random part of the key: the old link, and every snippet pasted with it, stops working at once (W5). */
  changeLink: manager
    .meta({ lifecycle: "revoke" })
    .output(websiteFormView)
    .mutation(async ({ ctx }) => {
      await ctx.db.forOrg(ctx.member.organizationId, (tx) => changeWebsiteFormLink(tx, ctx.member, new Date()));
      return viewFor(ctx);
    }),

  /** What a visitor would get from these unsaved settings, with a token that opens nothing. */
  preview: manager
    .input(saveWebsiteFormInput)
    .output(publicForm)
    .query(({ ctx, input }) => {
      assertOffersAllowed(input);
      return publicFormOf(ctx, {
        organizationId: ctx.member.organizationId,
        settings: input,
        openedToken: PREVIEW_TOKEN,
        turnstileSiteKey: null,
        now: new Date(),
      });
    }),

  /** Last 30 days; zeros before the first save. */
  counts: manager.output(formCountsView).query(({ ctx }) =>
    ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
      const form = await readWebsiteForm(tx);
      return formCounts(tx, form?.id ?? "00000000-0000-0000-0000-000000000000", new Date());
    }),
  ),
});
