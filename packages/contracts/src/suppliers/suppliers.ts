// Suppliers (release 7a): the hotels, transport operators and guides an agency buys from, their contacts, the costs linked to
// them, and what the agency owes. Amounts are integer paise.
import { z } from "zod";
import { tripCostCategory } from "../finance/finance.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

export const supplierKinds = ["hotel", "transport", "guide", "other"] as const;
export const supplierKind = z.enum(supplierKinds);
export type SupplierKind = z.infer<typeof supplierKind>;

const text = (max: number) => z.string().trim().max(max);

export const supplierFields = {
  kind: supplierKind,
  name: text(120).min(1),
  city: text(80),
  gstin: text(20),
  paymentTerms: text(300),
  /** Bank or UPI details: shown only to whoever may edit suppliers. */
  paymentDetails: text(500),
  notes: text(1000),
};
export const createSupplierInput = z.strictObject(supplierFields);
export type CreateSupplierInput = z.infer<typeof createSupplierInput>;
export const updateSupplierInput = z.strictObject({ supplierId: recordId, ...supplierFields });
export type UpdateSupplierInput = z.infer<typeof updateSupplierInput>;
export const supplierIdInput = z.strictObject({ supplierId: recordId });
export type SupplierIdInput = z.infer<typeof supplierIdInput>;

export const SUPPLIERS_PAGE_SIZE = 25;
export const listSuppliersInput = z.strictObject({
  kind: supplierKind.optional(),
  /** Part of a name. */
  search: text(80).optional(),
  /** The last supplier's id of the previous page. */
  cursor: recordId.optional(),
});
export type ListSuppliersInput = z.infer<typeof listSuppliersInput>;

export const supplierSummary = z.object({
  id: recordId,
  kind: supplierKind,
  name: z.string(),
  city: z.string(),
  /** The first contact's name and phone, to call from the list. */
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
});
export type SupplierSummary = z.infer<typeof supplierSummary>;
export const supplierPage = z.object({ items: z.array(supplierSummary), nextCursor: recordId.nullable() });
export type SupplierPage = z.infer<typeof supplierPage>;

const contactFields = {
  name: text(120).min(1),
  role: text(80),
  phone: text(40),
  whatsapp: text(40),
  email: text(200),
};
export const saveContactInput = z.strictObject({
  supplierId: recordId,
  /** Set to change a contact; left out to add one. */
  contactId: recordId.optional(),
  ...contactFields,
});
export type SaveContactInput = z.infer<typeof saveContactInput>;
export const contactIdInput = z.strictObject({ contactId: recordId });
export const supplierContact = z.object({ id: recordId, ...contactFields });
export type SupplierContact = z.infer<typeof supplierContact>;

/** A cost of the supplier's, with where it belongs: a booking or a whole departure. */
export const supplierCost = z.object({
  id: recordId,
  category: tripCostCategory,
  amountPaise: z.int(),
  dueOn: calendarDate.nullable(),
  paidOn: calendarDate.nullable(),
  note: z.string(),
  quoteId: recordId.nullable(),
  departureId: recordId.nullable(),
  /** The booking's or the departure's title. */
  forTitle: z.string(),
});
export type SupplierCost = z.infer<typeof supplierCost>;

export const supplierDetail = z.object({
  id: recordId,
  ...supplierFields,
  /** Empty for whoever may not edit suppliers. */
  paymentDetails: z.string(),
  contacts: z.array(supplierContact),
  /** Null for whoever may not see the accounts. */
  costs: z.array(supplierCost).nullable(),
  /** How many unlinked costs are named like this supplier (exactly, ignoring case); null without the accounts. */
  linkableCosts: z.int().nullable(),
  owedPaise: z.int().nullable(),
});
export type SupplierDetail = z.infer<typeof supplierDetail>;

export const linkCostsResult = z.object({ linked: z.int() });

/** What the agency owes: unpaid, unvoided costs grouped by supplier. */
export const dueItem = z.object({
  id: recordId,
  category: tripCostCategory,
  amountPaise: z.int(),
  dueOn: calendarDate.nullable(),
  overdue: z.boolean(),
  note: z.string(),
  /** Where the cost belongs: a booking's number and customer, or the departure's title. */
  forTitle: z.string(),
  quoteId: recordId.nullable(),
  departureId: recordId.nullable(),
});
export const dueGroup = z.object({
  /** Null for costs whose supplier was only typed as a name. */
  supplierId: recordId.nullable(),
  name: z.string(),
  owedPaise: z.int(),
  overduePaise: z.int(),
  items: z.array(dueItem),
});
export type DueGroup = z.infer<typeof dueGroup>;
export const dues = z.object({ totalPaise: z.int(), overduePaise: z.int(), groups: z.array(dueGroup) });
export type Dues = z.infer<typeof dues>;
