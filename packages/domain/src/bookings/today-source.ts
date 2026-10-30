// What Today shows about bookings (release 6): the person's own bookings that leave within 14 days while a traveller's
// details are still missing, one line for each with the count. Plain queries over the person's own leads.
import type { OrgTx } from "@travel-crm/db";
import { addDays, type CalendarDate } from "../kernel/index.js";
import { dayOf } from "./rows.js";

/** How far ahead a trip with missing details is brought to the person's attention. */
export const DETAILS_HORIZON_DAYS = 14;
const MOST_READ = 200;

export interface DetailsMissing {
  bookingId: string;
  leadId: string;
  number: string;
  startDate: CalendarDate;
  missing: number;
  total: number;
}

export async function bookingsMissingDetails(
  tx: OrgTx,
  ownerUserId: string,
  today: CalendarDate,
): Promise<DetailsMissing[]> {
  const bookings = await tx.booking.findMany({
    where: {
      status: "confirmed",
      lead: { ownerUserId, deletedAt: null },
      startDate: {
        gte: new Date(`${today}T00:00:00Z`),
        lte: new Date(`${addDays(today, DETAILS_HORIZON_DAYS)}T00:00:00Z`),
      },
      travellers: { some: { completeAt: null } },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: MOST_READ,
    select: {
      id: true,
      leadId: true,
      number: true,
      startDate: true,
      travellers: { select: { completeAt: true } },
    },
  });
  return bookings.flatMap((booking) =>
    booking.startDate === null
      ? []
      : [
          {
            bookingId: booking.id,
            leadId: booking.leadId,
            number: booking.number,
            startDate: dayOf(booking.startDate) as CalendarDate,
            missing: booking.travellers.filter((traveller) => traveller.completeAt === null).length,
            total: booking.travellers.length,
          },
        ],
  );
}
