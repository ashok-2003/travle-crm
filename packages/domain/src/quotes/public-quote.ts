// A quote as its customer sees it at /p/<token> (step 3, P0): the plan, the price, what is due and how to pay the agency
// by UPI; and accepting it there with their name, which the system records as the customer's (publicActor) and which
// moves the lead to Booking requested. A declined, replaced or unsent quote can't be accepted; accepting twice changes
// nothing. A replaced quote's link says so, with no prices.
import type { QuoteAcceptedEvent } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage } from "../crm/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, publicActor } from "../kernel/index.js";
import { dayOf, daysOf, findQuoteForSystem, itemsOf, paidOf } from "./quote-rows.js";
import { coveredInstallments } from "./totals.js";
import { quoteSettingsOf, upiPayLink } from "./settings.js";

export interface PublicQuote {
  title: string;
  customerName: string;
  startDate: string | null;
  adults: number;
  children: number;
  days: { title: string; description: string }[];
  items: { description: string; detail: string; quantity: number; unitPricePaise: number; amountPaise: number }[];
  inclusions: string;
  exclusions: string;
  notes: string;
  terms: string;
  subtotalPaise: number;
  taxPaise: number;
  taxRateBasisPoints: number;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  status: string;
  acceptedName: string | null;
  installments: { label: string; amountPaise: number; dueOn: string; paid: boolean }[];
  upiId: string;
  /** Opens the customer's UPI app for what is due next (or the balance); null without a UPI id. */
  payLink: string | null;
  payPaise: number;
  /**
   * The other options the agency sent this customer for the same enquiry (a 3-star and a 4-star), this one among them:
   * the customer accepts the one they choose. One option alone is just this quote.
   */
  options: { quoteId: string; title: string; totalPaise: number; status: string; current: boolean }[];
}

export async function publicQuoteOf(tx: OrgTx, quoteId: string): Promise<PublicQuote> {
  const quote = await findQuoteForSystem(tx, quoteId);
  const settings = await quoteSettingsOf(tx);
  const paidPaise = paidOf(quote);
  const totalPaise = Number(quote.totalPaise);
  const balancePaise = Math.max(0, totalPaise - paidPaise);
  const installments = coveredInstallments(
    quote.installments.map((due) => ({
      label: due.label,
      amountPaise: Number(due.amountPaise),
      dueOn: dayOf(due.dueOn),
    })),
    paidPaise,
  );
  // What to pay now: the next instalment not yet covered, as much of it as is left; else the balance.
  let left = paidPaise;
  let payPaise = balancePaise;
  for (const due of installments) {
    if (left >= due.amountPaise) {
      left -= due.amountPaise;
      continue;
    }
    payPaise = Math.min(balancePaise, due.amountPaise - left);
    break;
  }
  const siblings = await tx.quote.findMany({
    where: { leadId: quote.leadId, status: { in: ["sent", "accepted"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, totalPaise: true, status: true },
  });
  const options = (siblings.some((row) => row.id === quote.id) ? siblings : [...siblings, quote]).map((row) => ({
    quoteId: row.id,
    title: row.title,
    totalPaise: Number(row.totalPaise),
    status: row.status,
    current: row.id === quote.id,
  }));
  return {
    options,
    title: quote.title,
    customerName: quote.lead.person.name,
    startDate: quote.startDate === null ? null : dayOf(quote.startDate),
    adults: quote.adults,
    children: quote.children,
    days: daysOf(quote),
    items: itemsOf(quote).map((item) => ({
      description: item.description,
      detail: item.detail,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      amountPaise: item.unitPricePaise * item.quantity,
    })),
    inclusions: quote.inclusions,
    exclusions: quote.exclusions,
    notes: quote.notes,
    terms: settings.defaultTerms,
    subtotalPaise: Number(quote.subtotalPaise),
    taxPaise: Number(quote.taxPaise),
    taxRateBasisPoints: quote.taxRateBasisPoints,
    totalPaise,
    paidPaise,
    balancePaise,
    status: quote.status,
    acceptedName: quote.acceptedName,
    installments,
    upiId: settings.upiId,
    payLink: upiPayLink(settings, { amountPaise: payPaise, note: quote.title }),
    payPaise,
  };
}

/**
 * The customer accepts on the link, naming themselves, and choosing among the options they were sent (the opened quote
 * when they don't). The other options sent for the same enquiry are declined. Accepted already: nothing changes.
 */
export async function acceptQuoteFromLink(
  tx: OrgTx,
  input: {
    organizationId: string;
    quoteId: string;
    name: string;
    optionId?: string | undefined;
    /** The box "Send me trip updates on WhatsApp" was ticked. */
    tripUpdates?: boolean | undefined;
  },
  now: Date,
): Promise<void> {
  // Locked, so a customer's double tap, and a payment recorded at the same moment, take their turns.
  await tx.$queryRaw`SELECT id FROM quote WHERE id = ${input.quoteId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  const opened = await findQuoteForSystem(tx, input.quoteId);
  // An option must be one sent to the same customer for the same enquiry; anything else is the opened quote.
  const chosen =
    input.optionId === undefined || input.optionId === opened.id
      ? opened
      : await tx.quote.findFirst({
          where: { id: input.optionId, leadId: opened.leadId, status: { in: ["sent", "accepted"] } },
          select: { id: true, status: true, leadId: true },
        });
  const quote = chosen ?? opened;
  if (quote.status === "accepted") return;
  if (quote.status === "declined") throw new DomainError("CONFLICT", "QUOTE_DECLINED", "This quote was declined");
  if (quote.status === "replaced") {
    throw new DomainError("CONFLICT", "QUOTE_REPLACED", "This quote was replaced by a new version");
  }
  if (quote.status === "draft") throw new DomainError("CONFLICT", "QUOTE_NOT_SENT", "This quote was not sent yet");
  const name = input.name.trim().slice(0, 120);
  if (name === "") throw new DomainError("VALIDATION", "NAME_REQUIRED", "Type your name to accept");
  const actor = publicActor(input.organizationId);
  await tx.quote.update({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: now, acceptedName: name } });
  await tx.quote.updateMany({
    where: { leadId: quote.leadId, status: "sent", id: { not: quote.id } },
    data: { status: "declined" },
  });
  await recordAudit(tx, actor, {
    action: "quote.accepted-by-customer",
    entityType: "quote",
    entityId: quote.id,
    before: { status: quote.status },
    after: { status: "accepted" },
  });
  await advanceLeadStage(tx, actor, { leadId: quote.leadId, stage: "booking_requested" }, now);
  // The booking is made from this (bookings.create-from-quote); the traveller's trip-updates consent is kept with it.
  await publishEvent(tx, {
    type: "quote.accepted",
    payload: { quoteId: quote.id, leadId: quote.leadId, confirmed: false } satisfies QuoteAcceptedEvent,
  });
  if (input.tripUpdates === true) await recordTripUpdatesConsent(tx, quote.leadId, now);
}

/** The customer ticked "Send me trip updates on WhatsApp" when accepting: kept in the consent ledger, with the words shown. */
async function recordTripUpdatesConsent(tx: OrgTx, leadId: string, now: Date): Promise<void> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { personId: true } });
  if (lead === null) return;
  await tx.personConsent.create({
    data: {
      personId: lead.personId,
      purpose: "trip_updates",
      action: "granted",
      wording: TRIP_UPDATES_WORDING,
      wordingVersion: 1,
      source: "quote_accept",
      recordedAt: now,
    },
  });
}

/** The sentence beside the box on the quote page; the ledger keeps exactly this. */
export const TRIP_UPDATES_WORDING = "Send me trip updates on WhatsApp.";
