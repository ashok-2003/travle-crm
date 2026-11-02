// A booking's costs (step 6, P0): what the agency pays its suppliers for a quote (the hotel, the cab, the flights), owed
// until marked paid, voided (never deleted) when entered by mistake; and what is left of the price before GST once they
// are paid, its profit and margin. Whoever keeps the accounts (accounts:*) sees every booking's; every change is audited.
import {
  bookingCosts,
  type AddTripCostInput,
  type BookingCosts,
  type MarkTripCostPaidInput,
} from "@travel-crm/contracts/finance";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** Profit as hundredths of a percent of revenue; null without revenue. */
export const marginOf = (profitPaise: number, revenuePaise: number) =>
  revenuePaise > 0 ? Math.round((profitPaise * 10_000) / revenuePaise) : null;

async function liveQuote(tx: OrgTx, quoteId: string) {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, subtotalPaise: true, status: true },
  });
  if (quote === null) throw notFound();
  return quote;
}

export async function bookingCostsOf(tx: OrgTx, quoteId: string): Promise<BookingCosts> {
  const quote = await liveQuote(tx, quoteId);
  const rows = await tx.tripCost.findMany({
    where: { quoteId: quote.id, voidedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      category: true,
      supplier: true,
      supplierId: true,
      amountPaise: true,
      dueOn: true,
      paidOn: true,
      note: true,
    },
  });
  const costPaise = rows.reduce((total, row) => total + Number(row.amountPaise), 0);
  const revenuePaise = Number(quote.subtotalPaise);
  const profitPaise = revenuePaise - costPaise;
  return bookingCosts.parse({
    costs: rows.map((row) => ({
      ...row,
      amountPaise: Number(row.amountPaise),
      dueOn: row.dueOn === null ? null : dayOf(row.dueOn),
      paidOn: row.paidOn === null ? null : dayOf(row.paidOn),
    })),
    revenuePaise,
    costPaise,
    profitPaise,
    marginBasisPoints: marginOf(profitPaise, revenuePaise),
  });
}

/** What a cost is recorded against: a booking (its quote) or a whole departure (the hotel block, the bus). */
async function ownerOf(tx: OrgTx, input: Pick<AddTripCostInput, "quoteId" | "departureId">) {
  if (input.quoteId !== null) {
    const quote = await liveQuote(tx, input.quoteId);
    // Costs belong to a booking, and an accepted quote is the booking: a quote still on offer has none.
    if (quote.status !== "accepted") {
      throw new DomainError(
        "CONFLICT",
        "QUOTE_NOT_ACCEPTED",
        "Costs are recorded on a booking: accept the quote first",
      );
    }
    return { quoteId: quote.id, departureId: null, entityType: "quote", entityId: quote.id };
  }
  const departure =
    input.departureId === null
      ? null
      : await tx.departure.findUnique({ where: { id: input.departureId }, select: { id: true } });
  if (departure === null) throw notFound();
  return { quoteId: null, departureId: departure.id, entityType: "departure", entityId: departure.id };
}

export async function addTripCost(tx: OrgTx, access: MemberAccess, input: AddTripCostInput): Promise<void> {
  const owner = await ownerOf(tx, input);
  if (
    input.supplierId !== null &&
    (await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } })) === null
  ) {
    throw notFound();
  }
  const row = await tx.tripCost.create({
    data: {
      quoteId: owner.quoteId,
      departureId: owner.departureId,
      supplierId: input.supplierId,
      category: input.category,
      supplier: input.supplier,
      amountPaise: BigInt(input.amountPaise),
      dueOn: input.dueOn === null ? null : asDate(input.dueOn),
      paidOn: input.paidOn === null ? null : asDate(input.paidOn),
      note: input.note,
      createdBy: access.userId,
    },
    select: { id: true },
  });
  await recordAudit(tx, access, {
    action: "trip-cost.added",
    entityType: owner.entityType,
    entityId: owner.entityId,
    after: { tripCostId: row.id, category: input.category, amountPaise: input.amountPaise },
  });
}

export async function markTripCostPaid(tx: OrgTx, access: MemberAccess, input: MarkTripCostPaidInput): Promise<void> {
  const cost = await tx.tripCost.findUnique({
    where: { id: input.tripCostId },
    select: { id: true, quoteId: true, departureId: true, paidOn: true, voidedAt: true },
  });
  if (cost?.voidedAt !== null) throw notFound();
  await tx.tripCost.update({ where: { id: cost.id }, data: { paidOn: asDate(input.paidOn) } });
  await recordAudit(tx, access, {
    action: "trip-cost.paid",
    entityType: cost.quoteId === null ? "departure" : "quote",
    entityId: cost.quoteId ?? cost.departureId ?? cost.id,
    before: { tripCostId: cost.id, paidOn: cost.paidOn === null ? null : dayOf(cost.paidOn) },
    after: { tripCostId: cost.id, paidOn: input.paidOn },
  });
}

export async function voidTripCost(tx: OrgTx, access: MemberAccess, tripCostId: string, now: Date): Promise<void> {
  const cost = await tx.tripCost.findUnique({
    where: { id: tripCostId },
    select: { id: true, quoteId: true, departureId: true, amountPaise: true, voidedAt: true },
  });
  if (cost?.voidedAt !== null) throw notFound();
  await tx.tripCost.update({ where: { id: cost.id }, data: { voidedAt: now, voidedBy: access.userId } });
  await recordAudit(tx, access, {
    action: "trip-cost.voided",
    entityType: cost.quoteId === null ? "departure" : "quote",
    entityId: cost.quoteId ?? cost.departureId ?? cost.id,
    before: { tripCostId: cost.id, amountPaise: Number(cost.amountPaise) },
  });
}
