// publicPages.*: whether the agency's public package pages are on, and what they say about the agency (release 7b). Whoever
// manages settings switches them; the settings are read from the database, as they put the agency's words in public.
import { publicPageSettings, savePublicPageSettingsInput } from "@travel-crm/contracts/package-pages";
import { publicPageSettingsOf, savePublicPageSettings } from "@travel-crm/domain/package-pages";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = freshProcedure.requires("settings:manage");

export const publicPagesRouter = router({
  settings: manager
    .output(publicPageSettings)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => publicPageSettingsOf(tx))),

  save: manager
    .input(savePublicPageSettingsInput)
    .output(publicPageSettings)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => savePublicPageSettings(tx, ctx.member, input)),
    ),
});
