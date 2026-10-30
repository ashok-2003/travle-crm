// Suppliers (release 7a): the hotels, transport operators and guides an agency buys from. Staff keep a supplier with its
// contacts; a cost can be linked to it so the agency knows who it owes. A supplier is soft-deleted, and only when nothing is
// owed to it. The bank and UPI details are read only by whoever may edit suppliers, and the costs and amounts only by whoever
// keeps the accounts (the router passes what the member may see).
import {
  supplierDetail,
  supplierPage,
  SUPPLIERS_PAGE_SIZE,
  type CreateSupplierInput,
  type ListSuppliersInput,
  type SaveContactInput,
  type SupplierDetail,
  type SupplierPage,
  type UpdateSupplierInput,
} from "@travel-crm/contracts/suppliers";
import type { OrgTx } from "@travel-crm/db";
import { softDeleted } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such supplier");

async function assertNameFree(tx: OrgTx, name: string, exceptId: string | null): Promise<void> {
  const same = await tx.supplier.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (same !== null) {
    throw new DomainError("CONFLICT", "SUPPLIER_NAME_TAKEN", "Another supplier already has this name");
  }
}

export async function listSuppliers(tx: OrgTx, input: ListSuppliersInput): Promise<SupplierPage> {
  const search = input.search?.trim();
  const rows = await tx.supplier.findMany({
    where: {
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(search === undefined || search === "" ? {} : { name: { contains: search, mode: "insensitive" } }),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: SUPPLIERS_PAGE_SIZE + 1,
    ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
    select: {
      id: true,
      kind: true,
      name: true,
      city: true,
      contacts: { orderBy: [{ position: "asc" }, { id: "asc" }], take: 1, select: { name: true, phone: true } },
    },
  });
  const page = rows.slice(0, SUPPLIERS_PAGE_SIZE);
  return supplierPage.parse({
    items: page.map((row) => {
      const contact = row.contacts[0];
      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        city: row.city,
        contactName: contact?.name ?? null,
        contactPhone: contact === undefined || contact.phone === "" ? null : contact.phone,
      };
    }),
    nextCursor: rows.length > SUPPLIERS_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
  });
}

/** The unpaid, unvoided costs linked to a supplier: what the agency owes it. */
export const owedTo = async (tx: OrgTx, supplierId: string): Promise<number> =>
  Number(
    (
      await tx.tripCost.aggregate({
        where: { supplierId, voidedAt: null, paidOn: null },
        _sum: { amountPaise: true },
      })
    )._sum.amountPaise ?? 0n,
  );

export async function getSupplier(tx: OrgTx, access: MemberAccess, supplierId: string): Promise<SupplierDetail> {
  const row = await tx.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      kind: true,
      name: true,
      city: true,
      gstin: true,
      paymentTerms: true,
      paymentDetails: true,
      notes: true,
      contacts: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, name: true, role: true, phone: true, whatsapp: true, email: true },
      },
    },
  });
  if (row === null) throw notFound();
  const seesAccounts = access.permissions.has("accounts:view");
  const costs = seesAccounts
    ? await tx.tripCost.findMany({
        where: { supplierId: row.id, voidedAt: null },
        orderBy: [
          { paidOn: { sort: "asc", nulls: "first" } },
          { dueOn: { sort: "asc", nulls: "last" } },
          { id: "asc" },
        ],
        take: 200,
        select: {
          id: true,
          category: true,
          amountPaise: true,
          dueOn: true,
          paidOn: true,
          note: true,
          quoteId: true,
          departureId: true,
          quote: { select: { title: true } },
          departure: { select: { title: true } },
        },
      })
    : null;
  const linkable = seesAccounts
    ? await tx.tripCost.count({
        where: { supplierId: null, voidedAt: null, supplier: { equals: row.name, mode: "insensitive" } },
      })
    : null;
  return supplierDetail.parse({
    ...row,
    paymentDetails: access.permissions.has("suppliers:edit") ? row.paymentDetails : "",
    costs:
      costs === null
        ? null
        : costs.map((cost) => ({
            id: cost.id,
            category: cost.category,
            amountPaise: Number(cost.amountPaise),
            dueOn: cost.dueOn === null ? null : dayOf(cost.dueOn),
            paidOn: cost.paidOn === null ? null : dayOf(cost.paidOn),
            note: cost.note,
            quoteId: cost.quoteId,
            departureId: cost.departureId,
            forTitle: cost.quote?.title ?? cost.departure?.title ?? "",
          })),
    linkableCosts: linkable,
    owedPaise: seesAccounts ? await owedTo(tx, row.id) : null,
  });
}

export async function createSupplier(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateSupplierInput,
): Promise<{ id: string }> {
  await assertNameFree(tx, input.name, null);
  const created = await tx.supplier.create({ data: { ...input, createdBy: access.userId }, select: { id: true } });
  await recordAudit(tx, access, {
    action: "supplier.created",
    entityType: "supplier",
    entityId: created.id,
    after: { kind: input.kind, name: input.name },
  });
  return created;
}

export async function updateSupplier(tx: OrgTx, access: MemberAccess, input: UpdateSupplierInput): Promise<void> {
  const { supplierId, ...fields } = input;
  const before = await tx.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, kind: true, name: true },
  });
  if (before === null) throw notFound();
  await assertNameFree(tx, fields.name, before.id);
  await tx.supplier.update({ where: { id: before.id }, data: fields });
  await recordAudit(tx, access, {
    action: "supplier.changed",
    entityType: "supplier",
    entityId: before.id,
    before: { kind: before.kind, name: before.name },
    after: { kind: fields.kind, name: fields.name },
  });
}

/** Removes the supplier from the lists. Refused while the agency still owes it money. */
export async function deleteSupplier(tx: OrgTx, access: MemberAccess, supplierId: string): Promise<void> {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (supplier === null) throw notFound();
  if ((await tx.tripCost.count({ where: { supplierId, voidedAt: null, paidOn: null } })) > 0) {
    throw new DomainError(
      "CONFLICT",
      "SUPPLIER_HAS_UNPAID",
      "This supplier is still owed money: mark those costs paid first",
    );
  }
  await tx.supplier.update({ where: { id: supplier.id }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "supplier.deleted",
    entityType: "supplier",
    entityId: supplier.id,
    before: { name: supplier.name },
  });
}

export async function saveSupplierContact(tx: OrgTx, access: MemberAccess, input: SaveContactInput): Promise<void> {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
  if (supplier === null) throw notFound();
  const fields = {
    name: input.name,
    role: input.role,
    phone: input.phone,
    whatsapp: input.whatsapp,
    email: input.email,
  };
  let contactId: string;
  if (input.contactId === undefined) {
    const position = await tx.supplierContact.count({ where: { supplierId: supplier.id } });
    contactId = (
      await tx.supplierContact.create({ data: { supplierId: supplier.id, position, ...fields }, select: { id: true } })
    ).id;
  } else {
    const found = await tx.supplierContact.findFirst({
      where: { id: input.contactId, supplierId: supplier.id },
      select: { id: true },
    });
    if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such contact");
    contactId = found.id;
    await tx.supplierContact.update({ where: { id: contactId }, data: fields });
  }
  await recordAudit(tx, access, {
    action: "supplier.contact-saved",
    entityType: "supplier",
    entityId: supplier.id,
    after: { contactId, name: input.name },
  });
}

export async function removeSupplierContact(tx: OrgTx, access: MemberAccess, contactId: string): Promise<void> {
  const contact = await tx.supplierContact.findUnique({
    where: { id: contactId },
    select: { id: true, supplierId: true, name: true },
  });
  if (contact === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such contact");
  await tx.supplierContact.delete({ where: { id: contact.id } });
  await recordAudit(tx, access, {
    action: "supplier.contact-removed",
    entityType: "supplier",
    entityId: contact.supplierId,
    before: { contactId: contact.id, name: contact.name },
  });
}

/**
 * Links the costs not yet linked to anyone whose supplier name is this one's (exactly, ignoring case), in one tap. Nothing is
 * linked by itself. Returns how many.
 */
export async function linkSimilarCosts(tx: OrgTx, access: MemberAccess, supplierId: string): Promise<number> {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (supplier === null) throw notFound();
  const linked = await tx.tripCost.updateMany({
    where: { supplierId: null, supplier: { equals: supplier.name, mode: "insensitive" } },
    data: { supplierId: supplier.id },
  });
  if (linked.count > 0) {
    await recordAudit(tx, access, {
      action: "supplier.costs-linked",
      entityType: "supplier",
      entityId: supplier.id,
      after: { linked: linked.count },
    });
  }
  return linked.count;
}
