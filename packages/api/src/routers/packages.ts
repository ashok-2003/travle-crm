// packages.*: the agency's packages (release 7b): a ready trip a quote starts from, its tiers priced from the supplier rates, the
// words and photos of its public page, and publishing that page. Editing needs quotes:edit; making quotes from a package,
// quotes:create; publishing a page, and changing where customers pay, are outward-facing and need settings:manage. Photos go straight from the browser to storage.
import {
  calculatedFromPrice,
  madeQuotes,
  packageChoices,
  makeGroupQuoteInput,
  makeQuotesFromPackageInput,
  packageDetail,
  packageIdInput,
  quoteDetail,
  brochureRefInput,
  requestBrochureInput,
  describeBrochureInput,
  packageFiles,
  packagePhotoList,
  packagePhotoRefInput,
  requestPackagePhotoInput,
  removePackageSeasonInput,
  savePackageSeasonInput,
  saveSpecialPricesInput,
  saveTierInput,
  setPackagePublishedInput,
  setPackageSellableInput,
  tierIdInput,
  updatePackageInput,
  updatePackagePartInput,
} from "@travel-crm/contracts/quotes";
import { presignedUpload } from "@travel-crm/contracts/files";
import { makeGroupQuote } from "@travel-crm/domain/departures";
import {
  calculateFromPrice,
  confirmPackageFile,
  describeBrochure,
  confirmPackagePhoto,
  getPackage,
  listPackageFiles,
  listPackagePhotos,
  makeQuotesFromPackage,
  mergePackagePart,
  packagePhotoCount,
  removePackageFile,
  removePackagePhoto,
  requestPackageFileUpload,
  removePackageSeason,
  removeTier,
  savePackageSeason,
  saveSpecialPrices,
  requestPackagePhotoUpload,
  tiersOf,
  saveTier,
  setPackagePublished,
  setPackageSellable,
} from "@travel-crm/domain/quotes";
import { z } from "zod";
import { agencyToday } from "../package-departures-gate.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { savePackageWithSchedule } from "./package-save.js";
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
      const today = await agencyToday(ctx);
      const agencyCode = (
        (await ctx.identity.organizationProfile(ctx.member.organizationId))?.code ?? ""
      ).toLowerCase();
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        getPackage(tx, ctx.member, input.packageId, { photoCount, agencyCode, today }),
      );
    }),

  /** Saves the package; when its weekly days, months, nights or seats changed, makes the departures that now fit. */
  update: editor
    .input(updatePackageInput)
    .mutation(({ ctx, input }) => savePackageWithSchedule(ctx, input.packageId, () => input)),

  /** Saves the fields one section of the page names, keeping the rest as stored; a full save's checks and departures follow. */
  updatePart: editor
    .input(updatePackagePartInput)
    .mutation(({ ctx, input }) =>
      savePackageWithSchedule(ctx, input.packageId, (before) => mergePackagePart(before, input)),
    ),

  setPublished: publisher.input(setPackagePublishedInput).mutation(async ({ ctx, input }) => {
    const photoCount = await packagePhotoCount(ctx, ctx.member, input.packageId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => setPackagePublished(tx, ctx.member, input, photoCount));
  }),

  /** Lets the AI sell the package, or stops it: a business-critical switch, so it reads the session from the database. */
  setSellable: publisher.input(setPackageSellableInput).mutation(async ({ ctx, input }) => {
    const today = await agencyToday(ctx);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => setPackageSellable(tx, ctx.member, input, today));
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

  saveSeason: editor
    .input(savePackageSeasonInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => savePackageSeason(tx, ctx.member, input)),
    ),

  /** Special prices for some dates: the seasons around them are split to make room, in one transaction. */
  saveSpecialPrices: editor
    .input(saveSpecialPricesInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveSpecialPrices(tx, ctx.member, input)),
    ),

  removeSeason: editor
    .input(removePackageSeasonInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removePackageSeason(tx, ctx.member, input.seasonId)),
    ),

  /** "Calculate from the catalog": a suggestion for "From ₹X", never saved by itself. */
  calculateFrom: editor
    .input(packageIdInput)
    .output(calculatedFromPrice)
    .query(async ({ ctx, input }) => {
      const today = await agencyToday(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => calculateFromPrice(tx, input.packageId, today));
    }),

  /** The tiers a quote can start from, by name: for whoever makes quotes, who need not see the lines. */
  choices: maker
    .input(packageIdInput)
    .output(packageChoices)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => ({
        tiers: (await tiersOf(tx, input.packageId)).map(({ id, name }) => ({ id, name })),
      })),
    ),

  /** A quote for each tier chosen, as options of the lead's enquiry, priced from the season of the start date. */
  makeQuotes: maker
    .input(makeQuotesFromPackageInput)
    .output(madeQuotes)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => makeQuotesFromPackage(tx, ctx.member, input, context));
    }),

  /** A quote for a group trip: one open departure (so departures:view, and the plan's departures module, as the other quote-departure calls need) of the package and the rooms the party takes. */
  makeGroupQuote: orgProcedure
    .requires("departures:view", "quotes:create")
    .input(makeGroupQuoteInput)
    .output(quoteDetail)
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      const today = await agencyToday(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => makeGroupQuote(tx, ctx.member, input, context, today));
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

  files: editor
    .input(packageIdInput)
    .output(packageFiles)
    .query(({ ctx, input }) => listPackageFiles(ctx, ctx.member, input.packageId)),

  /** Brochures go with the package's words. */
  requestFileUpload: editor
    .input(requestBrochureInput)
    .output(z.object({ attachmentId: z.uuid(), upload: presignedUpload }))
    .mutation(({ ctx, input }) => requestPackageFileUpload(ctx, ctx.member, input)),

  confirmFile: editor.input(brochureRefInput).mutation(({ ctx, input }) => confirmPackageFile(ctx, ctx.member, input)),

  /** The owner's name and description for a brochure: what the AI agent calls it and captions it with. */
  describeFile: editor
    .input(describeBrochureInput)
    .mutation(({ ctx, input }) => describeBrochure(ctx, ctx.member, input)),

  removeFile: editor.input(brochureRefInput).mutation(({ ctx, input }) => removePackageFile(ctx, ctx.member, input)),
});
