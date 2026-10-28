// What fills an automatic WhatsApp's blanks (sales execution), for one lead: the customer's first name, where and when
// they want to go, their salesperson's name, the agency's name, and for a payment reminder the amount, the day and the
// quote's link; or the agency's own fixed words ("text:..."). A blank is never sent empty: WhatsApp refuses one, so each
// field has words to fall back on.
import type { TemplateField } from "@travel-crm/contracts/sales";
import type { OrgTx } from "@travel-crm/db";
import { formatMoney, money } from "../kernel/index.js";

export interface FillContext {
  agencyName: string;
  /** The lead's owner's name, from identity; null when the lead has none. */
  agentName: string | null;
  /** For a payment reminder. */
  payment?: { amountPaise: number; dueOn: string; link: string };
}

const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const monthWords = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" });

/** The lead's facts the blanks may show. */
export async function leadFacts(tx: OrgTx, leadId: string) {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      ownerUserId: true,
      travelKind: true,
      travelStart: true,
      travelMonth: true,
      destinationId: true,
      person: { select: { name: true } },
    },
  });
  if (lead === null) return null;
  const destination =
    lead.destinationId === null
      ? null
      : await tx.destination.findUnique({ where: { id: lead.destinationId }, select: { name: true } });
  const when =
    lead.travelKind === "dates" && lead.travelStart !== null
      ? dayWords.format(lead.travelStart)
      : lead.travelKind === "month" && lead.travelMonth !== null
        ? monthWords.format(lead.travelMonth)
        : null;
  return {
    ownerUserId: lead.ownerUserId,
    firstName: lead.person.name.trim().split(/\s+/)[0] ?? "",
    destination: destination?.name ?? null,
    when,
  };
}

export function fillParams(
  params: readonly string[],
  facts: NonNullable<Awaited<ReturnType<typeof leadFacts>>>,
  context: FillContext,
): string[] {
  const value = (field: TemplateField): string => {
    switch (field) {
      case "name":
        // A stand-in name ("WhatsApp +91...") is no name to greet.
        return facts.firstName === "" || facts.firstName.startsWith("WhatsApp") ? "there" : facts.firstName;
      case "destination":
        return facts.destination ?? "your trip";
      case "when":
        return facts.when ?? "your dates";
      case "agent":
        return context.agentName ?? context.agencyName;
      case "agency":
        return context.agencyName;
      case "amount":
        return context.payment === undefined ? "the amount due" : formatMoney(money(context.payment.amountPaise));
      case "due":
        return context.payment === undefined ? "soon" : dayWords.format(new Date(`${context.payment.dueOn}T00:00:00Z`));
      case "link":
        return context.payment?.link ?? context.agencyName;
    }
  };
  return params.map((param) => (param.startsWith("text:") ? param.slice(5).trim() : value(param as TemplateField)));
}
