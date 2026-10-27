// Fast quoting (sales execution): the agency's ready packages ("Manali 5 days"): a quote's plan and price saved once, and
// a new quote for any lead made from one in a tap, its dates and travellers from the lead. And another option of a quote
// (a 4-star beside the 3-star): a copy to change, which the customer sees beside the first on the link.
import {
  quotePackageList,
  type QuotePackage,
  type QuoteDetail,
  type SavePackageInput,
} from "@travel-crm/contracts/quotes";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { getLead } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { daysOf, findQuoteInScope, itemsOf } from "./quote-rows.js";
import { createQuote, type QuoteContext } from "./quotes.js";
import { createQuoteInput, quoteTaxRate } from "@travel-crm/contracts/quotes";

const taken = () => new DomainError("CONFLICT", "PACKAGE_NAME_TAKEN", "Another package already has this name");

export async function listPackages(tx: OrgTx): Promise<QuotePackage[]> {
  const rows = await tx.quoteTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true, days: true, items: true, taxRateBasisPoints: true },
  });
  return quotePackageList.parse(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      days: daysOf(row).length,
      subtotalPaise: itemsOf(row).reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0),
      taxRateBasisPoints: row.taxRateBasisPoints,
    })),
  );
}

/** Saves the quote's plan and price as a package; a name in use is refused. */
export async function savePackage(tx: OrgTx, access: MemberAccess, input: SavePackageInput): Promise<{ id: string }> {
  const quote = await findQuoteInScope(tx, access, input.quoteId);
  if ((await tx.quoteTemplate.findFirst({ where: { name: input.name }, select: { id: true } })) !== null) throw taken();
  try {
    const row = await tx.quoteTemplate.create({
      data: {
        name: input.name,
        title: quote.title,
        days: daysOf(quote),
        items: itemsOf(quote),
        inclusions: quote.inclusions,
        exclusions: quote.exclusions,
        notes: quote.notes,
        taxRateBasisPoints: quote.taxRateBasisPoints,
        createdBy: access.userId,
      },
      select: { id: true },
    });
    await recordAudit(tx, access, {
      action: "quote-package.saved",
      entityType: "quote_template",
      entityId: row.id,
      after: { name: input.name },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw taken();
    throw error;
  }
}

export async function deletePackage(tx: OrgTx, access: MemberAccess, packageId: string): Promise<void> {
  const row = await tx.quoteTemplate.findUnique({ where: { id: packageId }, select: { id: true, name: true } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.quoteTemplate.update({ where: { id: row.id }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "quote-package.deleted",
    entityType: "quote_template",
    entityId: row.id,
    before: { name: row.name },
  });
}

/** A new draft quote for the lead from a package, with the lead's dates and travellers. */
export async function quoteFromPackage(
  tx: OrgTx,
  access: MemberAccess,
  input: { leadId: string; packageId: string },
  context: QuoteContext,
): Promise<QuoteDetail> {
  const lead = await getLead(tx, access, input.leadId);
  const row = await tx.quoteTemplate.findUnique({ where: { id: input.packageId } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  return createQuote(
    tx,
    access,
    {
      leadId: lead.id,
      title: row.title,
      startDate: lead.trip.when.kind === "dates" ? lead.trip.when.from : null,
      adults: lead.trip.adults ?? 2,
      children: lead.trip.childrenAges.length,
      days: daysOf(row),
      items: itemsOf(row),
      inclusions: row.inclusions,
      exclusions: row.exclusions,
      notes: row.notes,
      taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
      placeOfSupply: null,
    },
    context,
  );
}

/** Another option of the quote: a draft copy beside it, to change (a 4-star hotel), which the link shows beside it. */
export async function duplicateQuote(
  tx: OrgTx,
  access: MemberAccess,
  quoteId: string,
  context: QuoteContext,
): Promise<QuoteDetail> {
  const quote = await findQuoteInScope(tx, access, quoteId);
  const options = await tx.quote.count({ where: { leadId: quote.leadId } });
  return createQuote(
    tx,
    access,
    {
      leadId: quote.leadId,
      title: `${quote.title.replace(/ \(option \d+\)$/, "")} (option ${String(options + 1)})`.slice(0, 120),
      startDate: quote.startDate === null ? null : quote.startDate.toISOString().slice(0, 10),
      adults: quote.adults,
      children: quote.children,
      days: daysOf(quote),
      items: itemsOf(quote),
      inclusions: quote.inclusions,
      exclusions: quote.exclusions,
      notes: quote.notes,
      taxRateBasisPoints: quoteTaxRate.catch(500).parse(quote.taxRateBasisPoints),
      placeOfSupply: createQuoteInput.shape.placeOfSupply.catch(null).parse(quote.placeOfSupply),
    },
    context,
  );
}
