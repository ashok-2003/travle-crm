// The bookings (step 6, P0): every accepted quote, newest first, a page at a time, with what it is worth before GST, what the customer paid
// and still owes, what it costs (and of that, what the agency still owes its suppliers), and its profit and margin.
import { BOOKINGS_PAGE_SIZE, bookingPage, type BookingPage, type BookingsInput } from "@travel-crm/contracts/finance";
import type { OrgTx } from "@travel-crm/db";
import { marginOf } from "./costs.js";

const dayOf = (date: Date | null) => (date === null ? null : date.toISOString().slice(0, 10));

/** The cursor (checked by the contract) is the last booking's acceptance moment and id: the next page starts just after it. */
function afterCursor(cursor: string | undefined) {
  if (cursor === undefined) return {};
  const [at = "", id = ""] = cursor.split("_");
  const when = new Date(at);
  return { OR: [{ acceptedAt: { lt: when } }, { acceptedAt: when, id: { lt: id } }] };
}

export async function listBookings(tx: OrgTx, input: BookingsInput): Promise<BookingPage> {
  const rows = await tx.quote.findMany({
    where: { status: "accepted", acceptedAt: { not: null }, ...afterCursor(input.cursor) },
    orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
    take: BOOKINGS_PAGE_SIZE + 1,
    select: {
      id: true,
      leadId: true,
      title: true,
      startDate: true,
      acceptedAt: true,
      subtotalPaise: true,
      totalPaise: true,
      lead: { select: { person: { select: { name: true } } } },
      payments: { where: { voidedAt: null }, select: { amountPaise: true } },
      costs: { where: { voidedAt: null }, select: { amountPaise: true, paidOn: true } },
    },
  });
  const page = rows.slice(0, BOOKINGS_PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor =
    rows.length > BOOKINGS_PAGE_SIZE && last?.acceptedAt != null ? `${last.acceptedAt.toISOString()}_${last.id}` : null;
  return bookingPage.parse({
    items: page.map((row) => {
      const revenuePaise = Number(row.subtotalPaise);
      const totalPaise = Number(row.totalPaise);
      const paidPaise = row.payments.reduce((sum, payment) => sum + Number(payment.amountPaise), 0);
      const costPaise = row.costs.reduce((sum, cost) => sum + Number(cost.amountPaise), 0);
      const owedPaise = row.costs
        .filter((cost) => cost.paidOn === null)
        .reduce((sum, cost) => sum + Number(cost.amountPaise), 0);
      const profitPaise = revenuePaise - costPaise;
      return {
        quoteId: row.id,
        leadId: row.leadId,
        customerName: row.lead.person.name,
        title: row.title,
        startDate: dayOf(row.startDate),
        acceptedOn: dayOf(row.acceptedAt),
        revenuePaise,
        totalPaise,
        paidPaise,
        balancePaise: Math.max(0, totalPaise - paidPaise),
        costPaise,
        owedPaise,
        profitPaise,
        marginBasisPoints: marginOf(profitPaise, revenuePaise),
      };
    }),
    nextCursor,
  });
}
