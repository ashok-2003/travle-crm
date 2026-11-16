// Fast quoting (sales execution): the agency's ready packages ("Manali 5 days"): a quote's plan and price saved once, and
// a new quote for any lead made from one in a tap, its dates and travellers from the lead. And another option of a quote
// (a 4-star beside the 3-star): a copy to change, which the customer sees beside the first on the link.
import {
  quotePackageList,
  type CreatePackageInput,
  type QuotePackage,
  type QuoteDetail,
  type SavePackageInput,
} from "@travel-crm/contracts/quotes";
import { isUniqueViolation, softDeleted, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { getLead } from "../crm/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { calendarDateIn, DomainError, type CalendarDate } from "../kernel/index.js";
import { nameTaken } from "./package-row.js";
import { copyOf, daysOf, findQuoteInScope, itemsOf } from "./quote-rows.js";
import { createQuote, type QuoteContext } from "./quotes.js";
import { quoteTaxRate } from "@travel-crm/contracts/quotes";

/** The agency's packages by name; `today` (the agency's) counts a group trip's departures still to come. */
export async function listPackages(tx: OrgTx, today: CalendarDate): Promise<QuotePackage[]> {
  const rows = await tx.quoteTemplate.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      days: true,
      items: true,
      taxRateBasisPoints: true,
      published: true,
      slug: true,
      kind: true,
      nights: true,
      fromPricePaise: true,
      aiSellable: true,
      _count: {
        select: {
          tiers: true,
          departures: { where: { status: { not: "cancelled" }, startDate: { gte: new Date(`${today}T00:00:00Z`) } } },
        },
      },
    },
  });
  return quotePackageList.parse(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      days: daysOf(row).length,
      subtotalPaise: itemsOf(row).reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0),
      taxRateBasisPoints: row.taxRateBasisPoints,
      published: row.published,
      slug: row.slug,
      tierCount: row._count.tiers,
      kind: row.kind,
      nights: row.nights,
      fromPricePaise: row.fromPricePaise === null ? null : Number(row.fromPricePaise),
      aiSellable: row.aiSellable,
      departuresAhead: row._count.departures,
    })),
  );
}

/** A new, empty package under a name, filled in on its own page; a name in use is refused. */
export async function createPackage(
  tx: OrgTx,
  access: MemberAccess,
  input: CreatePackageInput,
): Promise<{ id: string }> {
  if ((await tx.quoteTemplate.findFirst({ where: { name: input.name }, select: { id: true } })) !== null)
    throw nameTaken();
  try {
    const row = await tx.quoteTemplate.create({
      data: { name: input.name, title: input.name, kind: input.kind, createdBy: access.userId },
      select: { id: true },
    });
    await recordAudit(tx, access, {
      action: "quote-package.created",
      entityType: "quote_template",
      entityId: row.id,
      after: { name: input.name, kind: input.kind },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** Saves the quote's plan and price as a package; a name in use is refused. */
export async function savePackage(tx: OrgTx, access: MemberAccess, input: SavePackageInput): Promise<{ id: string }> {
  const quote = await findQuoteInScope(tx, access, input.quoteId);
  if ((await tx.quoteTemplate.findFirst({ where: { name: input.name }, select: { id: true } })) !== null)
    throw nameTaken();
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
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

export async function deletePackage(tx: OrgTx, access: MemberAccess, packageId: string): Promise<void> {
  const row = await tx.quoteTemplate.findUnique({ where: { id: packageId }, select: { id: true, name: true } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const today = calendarDateIn(new Date(), await organizationTimeZone(tx, access.organizationId));
  const upcoming = await tx.departure.count({
    where: { templateId: row.id, status: { not: "cancelled" }, startDate: { gte: new Date(`${today}T00:00:00Z`) } },
  });
  if (upcoming > 0) {
    throw new DomainError("CONFLICT", "PACKAGE_HAS_DEPARTURES", "Cancel the package's upcoming departures first");
  }
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
  const quote = await createQuote(
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
    true,
  );
  await tx.quote.update({ where: { id: quote.id }, data: { templateId: row.id } });
  return quote;
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
  const copy = copyOf(quote);
  return createQuote(
    tx,
    access,
    { ...copy, title: `${quote.title.replace(/ \(option \d+\)$/, "")} (option ${String(options + 1)})`.slice(0, 120) },
    context,
    true,
  );
}
