// Travellers' own details (spec 2.5): one row for each head of a booking. Anyone with the trip link fills any row until
// the cut-off, a few days before departure; staff fill or fix them any time. What a row must hold follows the booking's
// level: Basic (name, birthday), Detailed (plus an emergency contact), International (plus passport). ID numbers live in
// their own table, read only with documents:view_sensitive, and are never shown back to the traveller, who sees only
// "Details received". A row is complete when everything its level asks for is filled, and the booking counts "3 of 4".
import {
  publicTravellerInput,
  type PublicTravellerInput,
  type SaveTravellerInput,
  type TravellerIdentity,
  type TravellerLevel,
} from "@travel-crm/contracts/bookings";
import type { RoomRequest } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { softDeleted } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { addDays, calendarDateIn, DomainError, parseCalendarDate, publicActor, type Actor } from "../kernel/index.js";
import { assertOpen, asDate, dayOf, findBookingForChange, findBookingForSystem, type BookingRow } from "./rows.js";
import { bookingSettingsOf } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

interface Details {
  name: string;
  dateOfBirth: Date | null;
  emergencyName: string;
  emergencyPhone: string;
}

/** Whether a traveller's row holds everything the level asks for. `hasPassport` is a passport with its number, dates and nationality. */
export function isComplete(level: TravellerLevel, row: Details, hasPassport: boolean): boolean {
  if (row.name.trim() === "" || row.dateOfBirth === null) return false;
  if (level === "basic") return true;
  if (row.emergencyName.trim() === "" || row.emergencyPhone.trim() === "") return false;
  return level === "detailed" || hasPassport;
}

const passportComplete = (
  identity: Pick<TravellerIdentity, "kind" | "number" | "issuedOn" | "expiresOn" | "nationality"> | null,
) =>
  identity !== null &&
  identity.kind === "passport" &&
  identity.number !== "" &&
  identity.issuedOn !== null &&
  identity.expiresOn !== null &&
  identity.nationality !== "";

/** The last day travellers may fill their details themselves: `detailsCutoffDays` before departure; null for a trip with no date. */
export async function detailsCutoffOf(tx: OrgTx, booking: Pick<BookingRow, "startDate">): Promise<string | null> {
  if (booking.startDate === null) return null;
  const { detailsCutoffDays } = await bookingSettingsOf(tx);
  return addDays(parseCalendarDate(dayOf(booking.startDate)), -detailsCutoffDays);
}

/** How many travellers hold everything and how many there are. */
export async function travellerProgress(tx: OrgTx, bookingId: string): Promise<{ total: number; complete: number }> {
  const [total, complete] = await Promise.all([
    tx.bookingTraveller.count({ where: { bookingId } }),
    tx.bookingTraveller.count({ where: { bookingId, completeAt: { not: null } } }),
  ]);
  return { total, complete };
}

/** Writes a traveller's details, works out whether the row is complete, and tells the timeline when the last one is. */
async function applyDetails(
  tx: OrgTx,
  actor: Actor,
  booking: BookingRow,
  input: {
    travellerId: string;
    name: string;
    dateOfBirth: string | null;
    gender: "female" | "male" | "other" | null;
    phone: string;
    emergencyName: string;
    emergencyPhone: string;
    medicalNotes: string;
    roomRequest?: RoomRequest | undefined;
    roomNote?: string | undefined;
    identity: TravellerIdentity | null | undefined;
  },
  now: Date,
): Promise<void> {
  const row = await tx.bookingTraveller.findFirst({
    where: { id: input.travellerId, bookingId: booking.id },
    select: { id: true },
  });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such traveller");
  const before = await travellerProgress(tx, booking.id);
  if (input.identity !== null && input.identity !== undefined) {
    const identity = {
      kind: input.identity.kind,
      number: input.identity.number,
      issuedOn: input.identity.issuedOn === null ? null : asDate(input.identity.issuedOn),
      expiresOn: input.identity.expiresOn === null ? null : asDate(input.identity.expiresOn),
      nationality: input.identity.nationality,
      updatedAt: now,
    };
    await tx.bookingTravellerIdentity.upsert({
      where: { organizationId_travellerId: { organizationId: booking.organizationId, travellerId: row.id } },
      create: { travellerId: row.id, ...identity },
      update: identity,
    });
  }
  const stored = await tx.bookingTravellerIdentity.findUnique({
    where: { organizationId_travellerId: { organizationId: booking.organizationId, travellerId: row.id } },
    select: { kind: true, number: true, issuedOn: true, expiresOn: true, nationality: true },
  });
  const hasPassport = passportComplete(
    stored === null
      ? null
      : {
          kind: stored.kind as TravellerIdentity["kind"],
          number: stored.number,
          issuedOn: stored.issuedOn === null ? null : dayOf(stored.issuedOn),
          expiresOn: stored.expiresOn === null ? null : dayOf(stored.expiresOn),
          nationality: stored.nationality,
        },
  );
  const dateOfBirth = input.dateOfBirth === null ? null : asDate(input.dateOfBirth);
  const complete = isComplete(booking.level as TravellerLevel, { ...input, dateOfBirth }, hasPassport);
  await tx.bookingTraveller.update({
    where: { id: row.id },
    data: {
      name: input.name,
      dateOfBirth,
      gender: input.gender,
      phone: input.phone,
      emergencyName: input.emergencyName,
      emergencyPhone: input.emergencyPhone,
      medicalNotes: input.medicalNotes,
      ...(input.roomRequest === undefined ? {} : { roomRequest: input.roomRequest }),
      ...(input.roomNote === undefined ? {} : { roomNote: input.roomNote }),
      completeAt: complete ? now : null,
      updatedAt: now,
    },
  });
  await recordAudit(tx, actor, {
    action: "booking.traveller-saved",
    entityType: "booking",
    entityId: booking.id,
    after: { travellerId: row.id, complete },
  });
  const after = await travellerProgress(tx, booking.id);
  if (after.total > 0 && after.complete === after.total && before.complete < before.total) {
    await recordBookingEvent(tx, actor, { leadId: booking.leadId, bookingId: booking.id, event: "details-complete" });
  }
}

/** A traveller's details sent from the trip page. Refused once the cut-off has passed, and on a booking not confirmed. */
export async function saveTravellerFromLink(
  tx: OrgTx,
  input: { organizationId: string; quoteId: string; traveller: PublicTravellerInput },
  now: Date,
): Promise<void> {
  const traveller = publicTravellerInput.parse(input.traveller);
  const found = await tx.booking.findFirst({
    where: { quoteId: input.quoteId, status: { in: ["confirmed", "completed"] } },
    select: { id: true },
  });
  if (found === null) throw new DomainError("CONFLICT", "BOOKING_NOT_OPEN", "Details can't be sent for this booking");
  const booking = await findBookingForSystem(tx, found.id, true);
  const timeZone = await organizationTimeZone(tx, booking.organizationId);
  const cutoff = await detailsCutoffOf(tx, booking);
  if (booking.status === "completed" || (cutoff !== null && calendarDateIn(now, timeZone) > cutoff)) {
    throw new DomainError("CONFLICT", "DETAILS_LOCKED", "Details can no longer be changed here; ask your agent");
  }
  if (traveller.idPhotoAttachmentId !== null) {
    const photo = await tx.attachment.findFirst({
      where: {
        id: traveller.idPhotoAttachmentId,
        recordType: "booking_traveller",
        recordId: traveller.travellerId,
        sensitive: true,
        status: "ready",
      },
      select: { id: true },
    });
    if (photo === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  }
  await applyDetails(tx, publicActor(input.organizationId), booking, traveller, now);
}

/** Staff fill or fix a traveller's row, any time. An ID number needs documents:view_sensitive, as reading it does. */
export async function saveTravellerByStaff(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveTravellerInput,
  now: Date,
): Promise<void> {
  const row = await tx.bookingTraveller.findUnique({ where: { id: input.travellerId }, select: { bookingId: true } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such traveller");
  const booking = await findBookingForChange(tx, access, row.bookingId);
  assertOpen(booking);
  if (input.identity !== null && !access.permissions.has("documents:view_sensitive")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
  }
  await applyDetails(tx, access, booking, input, now);
}

/** The ID numbers of one traveller, for a member who may read them; the reading is audited. */
export async function travellerIdentityOf(
  tx: OrgTx,
  access: MemberAccess,
  travellerId: string,
): Promise<TravellerIdentity | null> {
  if (!access.permissions.has("documents:view_sensitive")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
  }
  const row = await tx.bookingTraveller.findUnique({ where: { id: travellerId }, select: { bookingId: true } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such traveller");
  const booking = await findBookingForChange(tx, access, row.bookingId);
  const identity = await tx.bookingTravellerIdentity.findUnique({
    where: { organizationId_travellerId: { organizationId: booking.organizationId, travellerId } },
  });
  await recordAudit(tx, access, {
    action: "booking.identity-viewed",
    entityType: "booking",
    entityId: booking.id,
    after: { travellerId },
  });
  if (identity === null) return null;
  return {
    kind: identity.kind === "passport" ? "passport" : "other_id",
    number: identity.number,
    issuedOn: identity.issuedOn === null ? null : dayOf(identity.issuedOn),
    expiresOn: identity.expiresOn === null ? null : dayOf(identity.expiresOn),
    nationality: identity.nationality,
  };
}

/** Changes the booking's headcount: empty rows are added, or the last rows removed (a soft delete). */
export async function setTravellerCount(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; count: number },
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  const rows = await tx.bookingTraveller.findMany({
    where: { bookingId: booking.id },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  if (input.count > rows.length) {
    const next = (rows.at(-1)?.position ?? -1) + 1;
    await tx.bookingTraveller.createMany({
      data: Array.from({ length: input.count - rows.length }, (_, index) => ({
        bookingId: booking.id,
        position: next + index,
      })),
    });
  } else if (input.count < rows.length) {
    for (const row of rows.slice(input.count)) {
      await tx.bookingTraveller.update({ where: { id: row.id }, data: softDeleted(access.userId) });
    }
  }
  await recordAudit(tx, access, {
    action: "booking.travellers-counted",
    entityType: "booking",
    entityId: booking.id,
    before: { count: rows.length },
    after: { count: input.count },
  });
}

/** Sets how much each traveller fills in; every row is checked again against the new level. */
export async function setLevel(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string; level: TravellerLevel },
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  await tx.booking.update({ where: { id: booking.id }, data: { level: input.level } });
  const rows = await tx.bookingTraveller.findMany({
    where: { bookingId: booking.id },
    select: { id: true, name: true, dateOfBirth: true, emergencyName: true, emergencyPhone: true },
  });
  const identities = await tx.bookingTravellerIdentity.findMany({
    where: { travellerId: { in: rows.map((row) => row.id) } },
    select: { travellerId: true, kind: true, number: true, issuedOn: true, expiresOn: true, nationality: true },
  });
  for (const row of rows) {
    const stored = identities.find((identity) => identity.travellerId === row.id);
    const passport =
      stored !== undefined &&
      passportComplete({
        kind: stored.kind === "passport" ? "passport" : "other_id",
        number: stored.number,
        issuedOn: stored.issuedOn === null ? null : dayOf(stored.issuedOn),
        expiresOn: stored.expiresOn === null ? null : dayOf(stored.expiresOn),
        nationality: stored.nationality,
      });
    await tx.bookingTraveller.update({
      where: { id: row.id },
      data: { completeAt: isComplete(input.level, row, passport) ? now : null },
    });
  }
  await recordAudit(tx, access, {
    action: "booking.level-changed",
    entityType: "booking",
    entityId: booking.id,
    before: { level: booking.level },
    after: { level: input.level },
  });
}
