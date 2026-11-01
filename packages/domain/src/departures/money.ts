// A departure's money (release 7a): its bookings' price before GST, minus what those bookings cost and what the departure
// itself costs (the hotel block, the bus). Costs are voided, never deleted; only unvoided ones count. For whoever keeps the
// accounts: the router needs accounts:view.
import { departureMoney, type DepartureMoney } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { marginOf } from "../finance/index.js";
import { dayOf, findDeparture } from "./rows.js";

export async function departureMoneyOf(tx: OrgTx, departureId: string): Promise<DepartureMoney> {
  const departure = await findDeparture(tx, departureId);
  const bookings = await tx.booking.findMany({
    where: { departureId: departure.id, status: { in: ["requested", "confirmed", "completed"] } },
    select: { quoteId: true, quote: { select: { subtotalPaise: true } } },
  });
  const quoteIds = bookings.map((booking) => booking.quoteId);
  const [bookingCosts, departureCosts] = await Promise.all([
    tx.tripCost.aggregate({ where: { quoteId: { in: quoteIds }, voidedAt: null }, _sum: { amountPaise: true } }),
    tx.tripCost.findMany({
      where: { departureId: departure.id, voidedAt: null },
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
    }),
  ]);
  const revenuePaise = bookings.reduce((total, booking) => total + Number(booking.quote.subtotalPaise), 0);
  const bookingCostPaise = Number(bookingCosts._sum.amountPaise ?? 0n);
  const departureCostPaise = departureCosts.reduce((total, cost) => total + Number(cost.amountPaise), 0);
  const profitPaise = revenuePaise - bookingCostPaise - departureCostPaise;
  return departureMoney.parse({
    revenuePaise,
    bookingCostPaise,
    departureCostPaise,
    profitPaise,
    marginBasisPoints: marginOf(profitPaise, revenuePaise),
    costs: departureCosts.map((cost) => ({
      ...cost,
      amountPaise: Number(cost.amountPaise),
      dueOn: cost.dueOn === null ? null : dayOf(cost.dueOn),
      paidOn: cost.paidOn === null ? null : dayOf(cost.paidOn),
    })),
  });
}
