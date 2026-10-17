// Editing a lead's trip and its person from the lead's page (spec 3.4, 4), by anyone who can edit a lead they can see.
// The trip is replaced whole and "trip edited" goes on the timeline; the person's name and contacts are replaced, and a
// contact another live person holds is refused (R32: the editor names the holder through the known-contact check
// first). Each records only what changed; an edit that changes nothing records nothing.
import type { EditPersonInput, EditTripInput } from "@travel-crm/contracts/crm";
import { isUniqueViolation, type OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { changedFields } from "./changed-fields.js";
import { recordCrmAudit } from "./crm-audit.js";
import { findLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { contactFields, heldByAnother, personColumns, recordPersonEdit } from "./people.js";
import { resolveTrip, travelWhenOf, tripColumns, type TripColumns } from "./trip-columns.js";

/** How the audit log holds a trip: its destination by name, the money in paise (never personal data, R28). */
function tripSnapshot(trip: TripColumns, names: ReadonlyMap<string, string>) {
  return {
    destination: trip.destinationId === null ? null : (names.get(trip.destinationId) ?? null),
    when: travelWhenOf(trip),
    adults: trip.adults,
    childrenAges: trip.childrenAges,
    budget: trip.budgetPaise === null ? null : { amountPaise: Number(trip.budgetPaise), basis: trip.budgetBasis },
    departureCity: trip.departureCity,
    tripType: trip.tripType,
    hotelCategory: trip.hotelCategory,
    food: trip.food,
    roomType: trip.roomType,
  };
}

/** Replaces the lead's trip. */
export async function editLeadTrip(tx: OrgTx, access: MemberAccess, input: EditTripInput): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  const trip = tripColumns(await resolveTrip(tx, access, input.trip));
  const destinations = [lead.destinationId, trip.destinationId].filter((id): id is string => id !== null);
  const names = await destinationNames(tx, destinations);
  const changes = changedFields(tripSnapshot(lead, names), tripSnapshot(trip, names));
  if (changes === null) return;
  await tx.lead.update({ where: { id: lead.id }, data: trip });
  await recordLeadEvent(tx, access, { leadId: lead.id, kind: "trip-edited" });
  await recordCrmAudit(tx, access, { action: "lead.trip-edited", entityType: "lead", entityId: lead.id, ...changes });
  await publishEvent(tx, { type: "lead.trip-edited", payload: { leadId: lead.id } });
}

const contactTaken = () =>
  new DomainError("CONFLICT", "CONTACT_ON_ANOTHER_PERSON", "Another person has this phone, email or handle");

/** Replaces the lead's person's name and contacts; a contact on another live person is refused. */
export async function editLeadPerson(tx: OrgTx, access: MemberAccess, input: EditPersonInput): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  const person = await tx.person.findUniqueOrThrow({ where: { id: lead.personId }, select: personColumns });
  const edited = {
    name: input.person.name,
    phoneE164: input.person.phone ?? null,
    email: input.person.email ?? null,
    instagramHandle: input.person.instagramHandle ?? null,
  };
  for (const field of contactFields) {
    const value = edited[field.column];
    if (value !== null && (await heldByAnother(tx, person.id, field.column, value))) throw contactTaken();
  }
  try {
    await tx.person.update({ where: { id: person.id }, data: edited });
  } catch (error) {
    // Another person took the contact since the check: the transaction is spoilt, and the answer is the same.
    if (isUniqueViolation(error)) throw contactTaken();
    throw error;
  }
  await recordPersonEdit(tx, access, person, edited);
}
