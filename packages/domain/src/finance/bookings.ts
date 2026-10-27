// The bookings (step 6, P0): every accepted quote, newest first, with what it is worth before GST, what the customer paid
// and still owes, what it costs (and of that, what the agency still owes its suppliers), and its profit and margin.
import { bookingList, type BookingRow } from "@travel-crm/contracts/finance";
import type { OrgTx } from "@travel-crm/db";
import { marginOf } from "./costs.js";

const dayOf = (date: Date | null) => (date === null ? null : date.toISOString().slice(0, 10));

export async function listBookings(tx: OrgTx): Promise<BookingRow[]> {
  const rows = await tx.quote.findMany({
    where: { status: "accepted" },
    orderBy: [{ acceptedAt: "desc" }, { updatedAt: "desc" }],
    take: 300,
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
  return bookingList.parse(
    rows.map((row) => {
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
  );
}
