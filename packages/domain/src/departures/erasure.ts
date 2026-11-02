// What departures keep about a person, emptied or deleted when the customer is erased (R38): their holds and their places
// on a waitlist (by lead), their room assignments and the words of their room requests (by traveller). The departure itself,
// its seats and the rooms stay (the agency's books). Run on the platform's transaction, after bookings' own erasure.
import { withDeleted, type OrgTx } from "@travel-crm/db";

export interface DeparturesErased {
  holds: number;
  waitlist: number;
  assignments: number;
}

export function eraseDepartureParts(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[] },
): Promise<DeparturesErased> {
  return withDeleted(() => erase(tx, input));
}

async function erase(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[] },
): Promise<DeparturesErased> {
  const { organizationId } = input;
  const leadIds = [...input.leadIds];
  const travellers = await tx.bookingTraveller.findMany({
    where: { organizationId, booking: { leadId: { in: leadIds } } },
    select: { id: true },
  });
  const travellerIds = travellers.map((traveller) => traveller.id);
  // Plain DELETEs: the runtime role has no right to a hold, the platform role does.
  const assignments = await tx.departureRoomAssignment.deleteMany({
    where: { organizationId, travellerId: { in: travellerIds } },
  });
  await tx.bookingTraveller.updateMany({
    where: { organizationId, id: { in: travellerIds } },
    data: { roomRequest: "none", roomNote: "" },
  });
  const holds = await tx.departureHold.deleteMany({ where: { organizationId, leadId: { in: leadIds } } });
  const waitlist = await tx.departureWaitlist.deleteMany({ where: { organizationId, leadId: { in: leadIds } } });
  return { holds: holds.count, waitlist: waitlist.count, assignments: assignments.count };
}
