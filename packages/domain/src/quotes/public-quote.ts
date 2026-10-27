// A quote as its customer sees it at /p/<token> (step 3, P0): the plan, the price, what is due and how to pay the agency
// by UPI; and accepting it there with their name, which the system records as the customer's (publicActor) and which
// moves the lead to Booking requested. A declined quote can't be accepted; accepting twice changes nothing.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage } from "../crm/index.js";
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
  items: { description: string; detail: string; quantity: number; amountPaise: number }[];
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
  return {
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

/** The customer accepts on the link, naming themselves. Accepted already: nothing changes. */
export async function acceptQuoteFromLink(
  tx: OrgTx,
  input: { organizationId: string; quoteId: string; name: string },
  now: Date,
): Promise<void> {
  const quote = await findQuoteForSystem(tx, input.quoteId);
  if (quote.status === "accepted") return;
  if (quote.status === "declined") throw new DomainError("CONFLICT", "QUOTE_DECLINED", "This quote was declined");
  const name = input.name.trim().slice(0, 120);
  if (name === "") throw new DomainError("VALIDATION", "NAME_REQUIRED", "Type your name to accept");
  const actor = publicActor(input.organizationId);
  await tx.quote.update({ where: { id: quote.id }, data: { status: "accepted", acceptedAt: now, acceptedName: name } });
  await recordAudit(tx, actor, {
    action: "quote.accepted-by-customer",
    entityType: "quote",
    entityId: quote.id,
    before: { status: quote.status },
    after: { status: "accepted" },
  });
  await advanceLeadStage(tx, actor, { leadId: quote.leadId, stage: "booking_requested" }, now);
}
