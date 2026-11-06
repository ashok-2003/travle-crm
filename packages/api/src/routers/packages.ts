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
  paymentQrRefInput,
  requestBrochureInput,
  requestPaymentQrInput,
  setPackagePaymentDetailsInput,
  packageFiles,
  packagePhotoList,
  packagePhotoRefInput,
  requestPackagePhotoInput,
  removePackageSeasonInput,
  savePackageSeasonInput,
  saveTierInput,
  setPackagePublishedInput,
  setPackageSellableInput,
  tierIdInput,
  updatePackageInput,
} from "@travel-crm/contracts/quotes";
import { presignedUpload } from "@travel-crm/contracts/files";
import { generatePackageDepartures, makeGroupQuote, reconcilePackageDepartures } from "@travel-crm/domain/departures";
import {
  calculateFromPrice,
  confirmPackageFile,
  confirmPackagePhoto,
  findPackage,
  getPackage,
  listPackageFiles,
  listPackagePhotos,
  makeQuotesFromPackage,
  packagePhotoCount,
  removePackageFile,
  removePackagePhoto,
  requestPackageFileUpload,
  removePackageSeason,
  removeTier,
  savePackageSeason,
  requestPackagePhotoUpload,
  tiersOf,
  saveTier,
  setPackagePaymentDetails,
  setPackagePublished,
  setPackageSellable,
  updatePackage,
} from "@travel-crm/domain/quotes";
import { z } from "zod";
import { agencyToday, mayMakeDepartures } from "../package-departures-gate.js";
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
      const today = await agencyToday(ctx);
      const agencyCode = (
        (await ctx.identity.organizationProfile(ctx.member.organizationId))?.code ?? ""
      ).toLowerCase();
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        getPackage(tx, ctx.member, input.packageId, { photoCount, agencyCode, today }),
      );
    }),

  /** Saves the package; when its weekly days, months, nights or seats changed, makes the departures that now fit. */
  update: editor.input(updatePackageInput).mutation(async ({ ctx, input }) => {
    const today = await agencyToday(ctx);
    await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
      const before = await findPackage(tx, input.packageId);
      await updatePackage(tx, ctx.member, input);
      const same = (left: readonly number[], right: readonly number[]) =>
        [...left].sort().join() === [...right].sort().join();
      const changed =
        before.kind !== input.kind ||
        !same(before.weeklyDays, input.weeklyDays) ||
        !same(before.departureMonths, input.departureMonths) ||
        before.nights !== input.nights ||
        before.seatsPerDeparture !== input.seatsPerDeparture;
      // Making departures is departures work: skipped, silently, for a member or a plan without it.
      if (changed && mayMakeDepartures(ctx)) {
        await reconcilePackageDepartures(tx, ctx.member, input.packageId, today);
        await generatePackageDepartures(tx, ctx.member, input.packageId, today);
      }
    });
  }),

  setPublished: publisher.input(setPackagePublishedInput).mutation(async ({ ctx, input }) => {
    const photoCount = await packagePhotoCount(ctx, ctx.member, input.packageId);
    await ctx.db.forOrg(ctx.member.organizationId, (tx) => setPackagePublished(tx, ctx.member, input, photoCount));
  }),

  /** Where customers pay: money, so read from the database and held by whoever manages settings, as the agency's UPI id is. */
  setPaymentDetails: publisher
    .input(setPackagePaymentDetailsInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setPackagePaymentDetails(tx, ctx.member, input)),
    ),

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

  /** Brochures go with the package's words; the payment QR, where customers pay, has procedures of its own below. */
  requestFileUpload: editor
    .input(requestBrochureInput)
    .output(z.object({ attachmentId: z.uuid(), upload: presignedUpload }))
    .mutation(({ ctx, input }) => requestPackageFileUpload(ctx, ctx.member, input)),

  confirmFile: editor.input(brochureRefInput).mutation(({ ctx, input }) => confirmPackageFile(ctx, ctx.member, input)),

  removeFile: editor.input(brochureRefInput).mutation(({ ctx, input }) => removePackageFile(ctx, ctx.member, input)),

  requestPaymentQrUpload: publisher
    .input(requestPaymentQrInput)
    .output(z.object({ attachmentId: z.uuid(), upload: presignedUpload }))
    .mutation(({ ctx, input }) => requestPackageFileUpload(ctx, ctx.member, { ...input, kind: "payment_qr" })),

  confirmPaymentQr: publisher
    .input(paymentQrRefInput)
    .mutation(({ ctx, input }) => confirmPackageFile(ctx, ctx.member, { ...input, kind: "payment_qr" })),

  removePaymentQr: publisher
    .input(paymentQrRefInput)
    .mutation(({ ctx, input }) => removePackageFile(ctx, ctx.member, { ...input, kind: "payment_qr" })),
});
