// A quote on a departure (release 7a): "Make quote" on a hold starts a draft quote for the held seats, and "Add to departure"
// puts a draft quote on one; either way the quote's dates are the departure's, and when the traveller accepts, the booking
// made from it holds the seats (bookings copies the departure and turns the hold into the booking). Only a draft moves.
import type { SetQuoteDepartureInput } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { assertDraft, createQuote, findQuoteForChange, quoteSettingsOf, type QuoteContext } from "../quotes/index.js";
import { usableHold } from "./holds.js";
import { assertOpenForSeats, dayOf, findDeparture, findDepartureForChange } from "./rows.js";

/** Puts a draft quote on a departure, taking its first day; or takes it off again (the dates stay as they were). */
export async function setQuoteDeparture(tx: OrgTx, access: MemberAccess, input: SetQuoteDepartureInput): Promise<void> {
  const quote = await findQuoteForChange(tx, access, input.quoteId);
  assertDraft(quote);
  if (input.departureId === null) {
    if (quote.departureId === null) return;
    await tx.quote.update({ where: { id: quote.id }, data: { departureId: null, version: { increment: 1 } } });
  } else {
    const departure = await findDepartureForChange(tx, input.departureId);
    assertOpenForSeats(departure);
    await tx.quote.update({
      where: { id: quote.id },
      data: { departureId: departure.id, startDate: departure.startDate, version: { increment: 1 } },
    });
  }
  await recordAudit(tx, access, {
    action: "quote.departure-changed",
    entityType: "quote",
    entityId: quote.id,
    before: { departureId: quote.departureId },
    after: { departureId: input.departureId },
  });
}

/** A draft quote for a hold: the lead, the held seats as adults, the departure's price (when it has one) as the one line. */
export async function makeQuoteFromHold(
  tx: OrgTx,
  access: MemberAccess,
  holdId: string,
  context: QuoteContext,
): Promise<{ quoteId: string }> {
  const hold = await usableHold(tx, holdId, context.now);
  const departure = await findDeparture(tx, hold.departureId);
  assertOpenForSeats(departure);
  const settings = await quoteSettingsOf(tx);
  const quote = await createQuote(
    tx,
    access,
    {
      leadId: hold.leadId,
      title: departure.title,
      startDate: dayOf(departure.startDate),
      adults: hold.seats,
      children: 0,
      days: [],
      items:
        departure.pricePaise === null
          ? []
          : [
              {
                description: departure.title,
                detail: "",
                quantity: hold.seats,
                unitPricePaise: Number(departure.pricePaise),
              },
            ],
      inclusions: "",
      exclusions: "",
      notes: "",
      taxRateBasisPoints: settings.defaultTaxRateBasisPoints,
      placeOfSupply: null,
    },
    context,
  );
  await tx.quote.update({ where: { id: quote.id }, data: { departureId: departure.id } });
  return { quoteId: quote.id };
}
