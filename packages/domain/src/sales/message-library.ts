// The message library's blanks for one lead (release 5, spec 3.5): the customer's first name, where and when they want to
// go, the signed-in person's first name, the amount of the lead's latest quote (its next unpaid instalment, else the
// whole) and the quote's link, made when the message is used. The function that fills them is the contracts' own
// (fillBlanks), shared with the inbox and the owner's preview. A blank with nothing to fill stays in the text.
import { blanksIn, fillBlanks, type BlankName, type FilledMessage } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import { getLead } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { formatMoney, money } from "../kernel/index.js";
import { coveredInstallments } from "../quotes/index.js";
import { createShareLink } from "../share-links/index.js";

const DAY = 24 * 3_600_000;
const monthWords = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" });
const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? "";

interface LeadQuote {
  id: string;
  title: string;
  amountPaise: number;
}

/** The lead's latest quote the customer has been given (sent or accepted), and what is due on it next. */
async function latestQuote(tx: OrgTx, leadId: string): Promise<LeadQuote | null> {
  const quote = await tx.quote.findFirst({
    where: { leadId, status: { in: ["sent", "accepted"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      totalPaise: true,
      installments: { select: { id: true, amountPaise: true, dueOn: true } },
      payments: { where: { voidedAt: null }, select: { amountPaise: true } },
    },
  });
  if (quote === null) return null;
  const paid = quote.payments.reduce((sum, payment) => sum + Number(payment.amountPaise), 0);
  const next = coveredInstallments(
    quote.installments.map((row) => ({
      amountPaise: Number(row.amountPaise),
      dueOn: row.dueOn.toISOString().slice(0, 10),
    })),
    paid,
  ).find((installment) => !installment.paid);
  return { id: quote.id, title: quote.title, amountPaise: next?.amountPaise ?? Number(quote.totalPaise) };
}

/** What each blank is for this lead; a blank with no value is left out. */
async function valuesFor(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
  agentName: string,
): Promise<{ values: Partial<Record<BlankName, string>>; quote: LeadQuote | null }> {
  const lead = await getLead(tx, access, leadId);
  const { when, destination } = lead.trip;
  // "2026-10" for a month, the first day's month for dates.
  const month = when.kind === "month" ? when.month : when.kind === "dates" ? when.from : null;
  const quote = await latestQuote(tx, leadId);
  const name = firstWord(lead.person.name);
  const values: Partial<Record<BlankName, string>> = {
    // A stand-in name ("WhatsApp +91...") is no name to greet.
    ...(name !== "" && !name.startsWith("WhatsApp") && { name }),
    ...(destination !== null && { destination: destination.name }),
    ...(month !== null && { month: monthWords.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`)) }),
    ...(firstWord(agentName) !== "" && { agent: firstWord(agentName) }),
    ...(quote !== null && { amount: formatMoney(money(quote.amountPaise)) }),
  };
  return { values, quote };
}

const filled = (text: string): FilledMessage => ({ text, open: blanksIn(text) });

/** The text with this lead's facts in its blanks, for looking at; the quote's link is left as {link} until the message is used. */
export async function previewMessage(
  tx: OrgTx,
  access: MemberAccess,
  input: { leadId: string; text: string; agentName: string },
): Promise<FilledMessage> {
  const { values, quote } = await valuesFor(tx, access, input.leadId, input.agentName);
  // {link} has no value yet, but it will have one when the message is used if the lead has a quote: it is not "open" then.
  const result = filled(fillBlanks(input.text, values));
  return quote === null ? result : { ...result, open: result.open.filter((blank) => blank !== "link") };
}

/**
 * The same text, made ready to send: the quote's link is made now (a share link, 30 days) and put in. A message with no
 * {link} makes none.
 */
export async function readyMessage(
  tx: OrgTx,
  access: MemberAccess,
  input: { leadId: string; text: string; agentName: string; appUrl: string },
  now: Date,
): Promise<FilledMessage> {
  const { values, quote } = await valuesFor(tx, access, input.leadId, input.agentName);
  if (quote !== null && blanksIn(input.text).includes("link")) {
    const shared = await createShareLink(
      tx,
      access,
      {
        recordType: "quote",
        recordId: quote.id,
        label: `Quote: ${quote.title}`.slice(0, 120),
        expiresAt: new Date(now.getTime() + 30 * DAY),
      },
      now,
    );
    values.link = `${input.appUrl.replace(/\/$/, "")}${shared.path}`;
  }
  return filled(fillBlanks(input.text, values));
}
