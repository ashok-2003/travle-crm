// suppliers.*: the hotels, transport operators and guides an agency buys from (release 7a): seen with suppliers:view, added
// with suppliers:create, changed and deleted with suppliers:edit. A supplier's costs, amounts and the dues need the accounts
// (accounts:view); linking costs to a supplier needs accounts:edit too. Money is read from a session read afresh.
import {
  contactIdInput,
  createSupplierInput,
  dues,
  linkCostsResult,
  listSuppliersInput,
  saveContactInput,
  supplierDetail,
  supplierIdInput,
  supplierPage,
  updateSupplierInput,
} from "@travel-crm/contracts/suppliers";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  linkSimilarCosts,
  listSuppliers,
  removeSupplierContact,
  saveSupplierContact,
  supplierDues,
  updateSupplier,
} from "@travel-crm/domain/suppliers";
import { calendarDateIn } from "@travel-crm/domain/kernel";
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

  /** What the agency owes: unpaid costs by supplier, the overdue first. */
  dues: duesViewer.output(dues).query(async ({ ctx }) => {
    const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
    return ctx.db.forOrg(ctx.member.organizationId, (tx) => supplierDues(tx, calendarDateIn(new Date(), timeZone)));
  }),
});
