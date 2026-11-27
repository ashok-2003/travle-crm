// A booking a member makes straight from the Bookings list: the quote (made accepted at once, as the AI's is) and the confirmed
// booking with the agency's default schedule, in one transaction. From a package it takes the package's days, inclusions and
// terms; on a departure, the departure's day and its seats, refused as a quote on it is.
import type { CreateBookingInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage, getLead } from "../crm/index.js";
import { countsOf, findDeparture, seatsSoldAndHeld } from "../departures/index.js";
import type { MemberAccess } from "../identity/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { calendarDateIn, DomainError } from "../kernel/index.js";
import { createQuoteFor, daysOf, findPackage, quoteMoney, type QuoteContext } from "../quotes/index.js";
import { confirmBookingAs } from "./confirm.js";
import { createBookingFromQuote } from "./create-booking.js";
import { dayOf } from "./rows.js";

/** The pre-tax price whose tax brings the quote to exactly the total the member typed (a paise either way is tried). */
function subtotalFor(input: CreateBookingInput, supplierStateCode: string): number {
  const guess = Math.round((input.totalPaise * 10_000) / (10_000 + input.taxRateBasisPoints));
  for (const candidate of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
    const item = { description: input.title, detail: "", quantity: 1, unitPricePaise: candidate };
    if (quoteMoney([item], input.taxRateBasisPoints, supplierStateCode, null).totalPaise === input.totalPaise) {
      return candidate;
    }
  }
  return guess;
}

export async function createBookingDirect(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateBookingInput,
  context: QuoteContext,
): Promise<string> {
  const { now } = context;
  await getLead(tx, access, input.leadId);
  const row = input.packageId === null ? null : await findPackage(tx, input.packageId);
  let startDate = input.startDate;
  let departureId: string | null = null;
  if (input.departureId !== null) {
    const departure = await findDeparture(tx, input.departureId);
    const today = calendarDateIn(now, await organizationTimeZone(tx, access.organizationId));
    const day = dayOf(departure.startDate);
    const cutoff = departure.cutoffOn === null ? "" : dayOf(departure.cutoffOn);
    if (
      departure.templateId !== row?.id ||
      departure.status !== "open" ||
      day < today ||
      (cutoff !== "" && cutoff < today)
    ) {
      throw new DomainError("CONFLICT", "DEPARTURE_NOT_OPEN", "This departure is not open for booking");
    }
    const found = (await seatsSoldAndHeld(tx, [departure.id], now)).get(departure.id) ?? { sold: 0, held: 0 };
    if (input.adults + input.children > countsOf(departure.seatsTotal, found.sold, found.held).free) {
      throw new DomainError("CONFLICT", "NOT_ENOUGH_SEATS", "There aren't that many seats free on this departure");
    }
    startDate = day;
    departureId = departure.id;
  }
  const subtotal = subtotalFor(input, context.supplierStateCode ?? "");
  const made = await createQuoteFor(
    tx,
    access,
    {
      leadId: input.leadId,
      title: input.title,
      startDate,
      adults: input.adults,
      children: input.children,
      days: row === null ? [] : daysOf(row),
      items: [{ description: input.title, detail: "", quantity: 1, unitPricePaise: subtotal }],
      inclusions: row?.inclusions ?? "",
      exclusions: row?.exclusions ?? "",
      notes: row === null ? "" : row.notes.slice(0, 3000),
      taxRateBasisPoints: input.taxRateBasisPoints,
      placeOfSupply: null,
    },
    context,
  );
  await tx.quote.update({
    where: { id: made.id },
    data: {
      status: "accepted",
      sentAt: now,
      acceptedAt: now,
      supplierStateCode: context.supplierStateCode,
      ...(row === null ? {} : { templateId: row.id }),
      ...(departureId === null ? {} : { departureId }),
    },
  });
  await recordAudit(tx, access, {
    action: "quote.status-changed",
    entityType: "quote",
    entityId: made.id,
    before: { status: "draft" },
    after: { status: "accepted" },
  });
  await advanceLeadStage(tx, access, { leadId: input.leadId, stage: "booking_requested" }, now);
  await publishEvent(tx, {
    type: "quote.accepted",
    payload: { quoteId: made.id, leadId: input.leadId, confirmed: false },
  });
  const bookingId = await createBookingFromQuote(
    tx,
    { organizationId: access.organizationId, quoteId: made.id, confirmed: false },
    now,
  );
  if (bookingId === null) throw new Error("The accepted quote made no booking");
  await confirmBookingAs(tx, access, bookingId, now);
  return bookingId;
}
