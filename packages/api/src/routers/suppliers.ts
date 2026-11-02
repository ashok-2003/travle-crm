// suppliers.*: the hotels, transport operators and guides an agency buys from (release 7a): seen with suppliers:view, added
// with suppliers:create, changed and deleted with suppliers:edit. A supplier's costs, amounts and the dues need the accounts
// (accounts:view); linking costs to a supplier needs accounts:edit too. Money is read from a session read afresh.
import { saveRateBatchInput, saveRateBatchResult } from "@travel-crm/contracts/ai";
import {
  contactIdInput,
  copySeasonInput,
  createSupplierInput,
  dues,
  linkCostsResult,
  listSuppliersInput,
  rateIdInput,
  saveContactInput,
  saveRateInput,
  saveSeasonInput,
  seasonIdInput,
  supplierDetail,
  supplierIdInput,
  supplierPage,
  supplierRateCatalog,
  updateSupplierInput,
} from "@travel-crm/contracts/suppliers";
import { recordRatesApplied } from "@travel-crm/domain/ai";
import {
  copySeason,
  createSupplier,
  deleteRate,
  deleteSeason,
  deleteSupplier,
  getSupplier,
  linkSimilarCosts,
  listSuppliers,
  removeSupplierContact,
  saveRate,
  saveRateBatch,
  saveSeason,
  saveSupplierContact,
  supplierDues,
  supplierRates,
  updateSupplier,
} from "@travel-crm/domain/suppliers";
import { calendarDateIn, DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("suppliers:view");
const adder = orgProcedure.requires("suppliers:view", "suppliers:create");
const editor = orgProcedure.requires("suppliers:view", "suppliers:edit");
// A supplier's costs and amounts are money: read from the database, never the five-minute session cache.
const detailViewer = freshProcedure.requires("suppliers:view");
const linker = freshProcedure.requires("suppliers:view", "suppliers:edit", "accounts:view", "accounts:edit");
const duesViewer = freshProcedure.requires("accounts:view");
// A supplier's rates are what the agency pays: money, read from the database. Whoever keeps suppliers or may see margins reads them.
const rateViewer = freshProcedure.requires("suppliers:view");
const rateEditor = freshProcedure.requires("suppliers:view", "suppliers:edit");

export const suppliersRouter = router({
  list: viewer
    .input(listSuppliersInput)
    .output(supplierPage)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => listSuppliers(tx, input))),

  get: detailViewer
    .input(supplierIdInput)
    .output(supplierDetail)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => getSupplier(tx, ctx.member, input.supplierId)),
    ),

  create: adder
    .input(createSupplierInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createSupplier(tx, ctx.member, input)),
    ),

  update: editor
    .input(updateSupplierInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateSupplier(tx, ctx.member, input)),
    ),

  delete: editor
    .input(supplierIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteSupplier(tx, ctx.member, input.supplierId)),
    ),

  saveContact: editor
    .input(saveContactInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveSupplierContact(tx, ctx.member, input)),
    ),

  removeContact: editor
    .input(contactIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removeSupplierContact(tx, ctx.member, input.contactId)),
    ),

  /** "Link N costs named like this one": exact name, ignoring case, one tap. */
  linkCosts: linker
    .input(supplierIdInput)
    .output(linkCostsResult)
    .mutation(async ({ ctx, input }) => ({
      linked: await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        linkSimilarCosts(tx, ctx.member, input.supplierId),
      ),
    })),

  /** The supplier's seasons with their rates (release 7b): for whoever edits suppliers or may see margins. */
  rates: rateViewer
    .input(supplierIdInput)
    .output(supplierRateCatalog)
    .query(({ ctx, input }) => {
      if (!ctx.member.permissions.has("suppliers:edit") && !ctx.member.permissions.has("money:view_margin")) {
        throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires suppliers:edit or money:view_margin");
      }
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => supplierRates(tx, input.supplierId));
    }),

  saveSeason: rateEditor
    .input(saveSeasonInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => saveSeason(tx, ctx.member, input))),

  deleteSeason: rateEditor
    .input(seasonIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteSeason(tx, ctx.member, input.seasonId)),
    ),

  /** The season and its rates for other dates (next year), every cost changed by a share. */
  copySeason: rateEditor
    .input(copySeasonInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => copySeason(tx, ctx.member, input))),

  saveRate: rateEditor
    .input(saveRateInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => saveRate(tx, ctx.member, input))),

  /**
   * The rows of a rate sheet the AI read, as the person checked and edited them: new seasons and rates in one transaction, all or
   * nothing, through the seasons' and rates' own writes. The reading is audited as drafted by AI, approved by the member.
   */
  saveRateBatch: rateEditor
    .input(saveRateBatchInput)
    .output(saveRateBatchResult)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const saved = await saveRateBatch(tx, ctx.member, input);
        await recordRatesApplied(
          tx,
          ctx.member,
          {
            fillId: input.fillId,
            supplierId: input.supplierId,
            saved: input.rates.map((rate) => ({
              ref: rate.ref,
              item: rate.item,
              mealPlan: rate.mealPlan,
              occupancy: rate.occupancy,
              unit: rate.unit,
              costPaise: rate.costPaise,
            })),
          },
          new Date(),
        );
        return saved;
      }),
    ),

  deleteRate: rateEditor
    .input(rateIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => deleteRate(tx, ctx.member, input.rateId)),
    ),

  /** What the agency owes: unpaid costs by supplier, the overdue first. */
  dues: duesViewer.output(dues).query(async ({ ctx }) => {
    const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
    return ctx.db.forOrg(ctx.member.organizationId, (tx) => supplierDues(tx, calendarDateIn(new Date(), timeZone)));
  }),
});
