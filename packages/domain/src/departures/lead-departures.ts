// A lead's seats on departures (release 7a), for the lead's page: the holds still running and the waitlists it is on.
import { leadDepartureList, type LeadDeparture } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { getLead } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { dayOf } from "./rows.js";

export async function listLeadDepartures(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
  now: Date,
): Promise<LeadDeparture[]> {
  const lead = await getLead(tx, access, leadId);
  const [holds, waiting] = await Promise.all([
    tx.departureHold.findMany({
      where: { leadId: lead.id, status: "active", expiresAt: { gt: now } },
      orderBy: { expiresAt: "asc" },
      select: {
        id: true,
        seats: true,
        expiresAt: true,
        departure: { select: { id: true, title: true, startDate: true } },
      },
    }),
    tx.departureWaitlist.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "asc" },
      select: { seats: true, departure: { select: { id: true, title: true, startDate: true } } },
    }),
  ]);
  return leadDepartureList.parse([
    ...holds.map((hold) => ({
      departureId: hold.departure.id,
      title: hold.departure.title,
      startDate: dayOf(hold.departure.startDate),
      kind: "hold",
      seats: hold.seats,
      expiresAt: hold.expiresAt.toISOString(),
      holdId: hold.id,
    })),
    ...waiting.map((entry) => ({
      departureId: entry.departure.id,
      title: entry.departure.title,
      startDate: dayOf(entry.departure.startDate),
      kind: "waitlist",
      seats: entry.seats,
      expiresAt: null,
      holdId: null,
    })),
  ]);
}
