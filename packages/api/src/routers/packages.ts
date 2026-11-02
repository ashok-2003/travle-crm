// packages.*: the agency's packages (release 7b): a ready trip a quote starts from, its tiers priced from the supplier rates, the
// words and photos of its public page, and publishing that page. Editing needs quotes:edit; making quotes from a package,
// quotes:create; publishing a page is outward-facing and needs settings:manage. Photos go straight from the browser to storage.
import {
  calculatedFromPrice,
  madeQuotes,
  makeQuotesFromPackageInput,
  packageDetail,
  packageIdInput,
  packagePhotoList,
  packagePhotoRefInput,
  requestPackagePhotoInput,
  saveTierInput,
  setPackagePublishedInput,
  tierIdInput,
  updatePackageInput,
} from "@travel-crm/contracts/quotes";
import { presignedUpload } from "@travel-crm/contracts/files";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import {
  calculateFromPrice,
  confirmPackagePhoto,
  getPackage,
  listPackagePhotos,
  makeQuotesFromPackage,
  packagePhotoCount,
  removePackagePhoto,
  removeTier,
  requestPackagePhotoUpload,
  saveTier,
  setPackagePublished,
  updatePackage,
} from "@travel-crm/domain/quotes";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { quoteContext } from "./quotes.js";

const editor = orgProcedure.requires("quotes:edit");
const maker = orgProcedure.requires("quotes:create");
// Publishing puts the agency's words in public: read from the database, held by whoever manages settings.
const publisher = freshProcedure.requires("quotes:edit", "settings:manage");

export const packagesRouter = router({
  get: editor
    .input(packageIdInput)
    .output(packageDetail)
    .query(async ({ ctx, input }) => {
      const photoCount = await packagePhotoCount(ctx, ctx.member, input.packageId);
      const agencyCode = (
        (await ctx.identity.organizationProfile(ctx.member.organizationId))?.code ?? ""
      ).toLowerCase();
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        getPackage(tx, ctx.member, input.packageId, { photoCount, agencyCode }),
      );
    }),

  update: editor
    .input(updatePackageInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updatePackage(tx, ctx.member, input)),
    ),

  setPublished: publisher.input(setPackagePublishedInput).mutation(async ({ ctx, input }) => {
    const photoCount = await packagePhotoCount(ctx, ctx.member, input.packageId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => setPackagePublished(tx, ctx.member, input, photoCount));
  }),

  saveTier: editor
    .input(saveTierInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => saveTier(tx, ctx.member, input))),

  removeTier: editor
    .input(tierIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removeTier(tx, ctx.member, input.tierId)),
    ),

  /** "Calculate from the catalog": a suggestion for "From ₹X", never saved by itself. */
  calculateFrom: editor
    .input(packageIdInput)
    .output(calculatedFromPrice)
    .query(async ({ ctx, input }) => {
      const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
      const today = calendarDateIn(new Date(), timeZone);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => calculateFromPrice(tx, input.packageId, today));
    }),

  /** A quote for each tier chosen, as options of the lead's enquiry, priced from the season of the start date. */
  makeQuotes: maker
    .input(makeQuotesFromPackageInput)
    .output(madeQuotes)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => makeQuotesFromPackage(tx, ctx.member, input, context));
    }),

  photos: editor
    .input(packageIdInput)
    .output(packagePhotoList)
    .query(({ ctx, input }) => listPackagePhotos(ctx, ctx.member, input.packageId)),

  requestPhotoUpload: editor
    .input(requestPackagePhotoInput)
    .output(z.object({ attachmentId: z.uuid(), upload: presignedUpload }))
    .mutation(({ ctx, input }) => requestPackagePhotoUpload(ctx, ctx.member, input)),

  confirmPhoto: editor
    .input(packagePhotoRefInput)
    .mutation(({ ctx, input }) => confirmPackagePhoto(ctx, ctx.member, input)),

  removePhoto: editor
    .input(packagePhotoRefInput)
    .mutation(({ ctx, input }) => removePackagePhoto(ctx, ctx.member, input)),
});
