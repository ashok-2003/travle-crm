// The rooming list for a hotel (release 7a): a numbered PDF (RML-2026-0001, frozen when issued, rendered by the worker like
// every document) and a CSV that opens in Excel. Names and requests only: no IDs, phones or money. A PDF issued before the
// rooms changed reads as out of date, and issuing again makes a new one; the same rooms give the one issued before back.
import { ROOMING_DOCUMENT_PREFIX } from "@travel-crm/contracts/documents";
import type { RoomingStay, RoomRequest } from "@travel-crm/contracts/departures";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { issueDocument, type IssueDocumentOptions } from "../documents/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { getRooming, roomingFingerprint } from "./rooming-rows.js";
import { asDate, dayWords, findDepartureForChange } from "./rows.js";

type Branding = IssueDocumentOptions["branding"];

const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 3)}...`);
const requestWords: Record<RoomRequest, string> = {
  none: "",
  single_room: "single room",
  ground_floor: "ground floor",
  near_group: "near the group",
};
const requestOf = (traveller: { roomRequest: RoomRequest; roomNote: string }) =>
  [requestWords[traveller.roomRequest], traveller.roomNote].filter((part) => part !== "").join(": ");

async function stayRooming(
  tx: OrgTx,
  stayId: string,
): Promise<{ stay: RoomingStay; departureId: string; title: string }> {
  const found = await tx.departureStay.findUnique({
    where: { id: stayId },
    select: { id: true, departureId: true, departure: { select: { title: true } } },
  });
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such stay");
  const rooming = await getRooming(tx, found.departureId);
  const stay = rooming.stays.find((one) => one.id === stayId);
  if (stay === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such stay");
  return { stay, departureId: found.departureId, title: found.departure.title };
}

const filledRooms = (stay: RoomingStay) => stay.rooms.filter((room) => room.travellers.length > 0);

/** Issues the stay's rooming list as it is now; the one issued before is given back when nothing changed since. */
export async function issueRoomingList(
  tx: OrgTx,
  access: MemberAccess,
  stayId: string,
  branding: Branding,
  now: Date,
): Promise<{ documentId: string; number: string }> {
  const { stay, departureId, title } = await stayRooming(tx, stayId);
  await findDepartureForChange(tx, departureId);
  const rooms = filledRooms(stay);
  if (rooms.length === 0) {
    throw new DomainError("CONFLICT", "ROOMING_EMPTY", "Draft the rooms first: nobody is in a room yet");
  }
  if (stay.documentId !== null && stay.documentState === "current") {
    const kept = await tx.issuedDocument.findUniqueOrThrow({
      where: { id: stay.documentId },
      select: { number: true },
    });
    return { documentId: stay.documentId, number: kept.number };
  }
  const requests = rooms.flatMap((room) =>
    room.travellers.flatMap((traveller) => {
      const request = requestOf(traveller);
      return request === "" ? [] : [`${traveller.name}: ${request}`];
    }),
  );
  const issued = await issueDocument(
    tx,
    access,
    {
      template: "sample",
      prefix: ROOMING_DOCUMENT_PREFIX,
      content: {
        title: cut(`Rooming list: ${stay.hotelName}`, 80),
        recipient: {
          name: cut(stay.hotelName, 120),
          lines: [
            cut(title, 120),
            `Check-in ${dayWords(asDate(stay.checkIn))}, check-out ${dayWords(asDate(stay.checkOut))}`,
          ],
        },
        rows: rooms.map((room) => ({
          description: cut(`Room ${room.label}${room.groundFloor ? " (ground floor)" : ""}`, 500),
          detail: cut(room.travellers.map((traveller) => traveller.name).join(", "), 300),
          amount: `${String(room.travellers.length)} of ${String(room.capacity)}`,
        })),
        totals: [{ label: "Guests", amount: String(rooms.reduce((total, room) => total + room.travellers.length, 0)) }],
        ...(requests.length === 0 ? {} : { notes: cut(`Requests\n${requests.join("\n")}`, 2000) }),
      },
      branding,
    },
    now,
  );
  await tx.departureStay.update({
    where: { id: stayId },
    data: {
      roomingDocumentId: issued.id,
      roomingFingerprint: roomingFingerprint(
        { hotelName: stay.hotelName, checkIn: asDate(stay.checkIn), checkOut: asDate(stay.checkOut) },
        stay.rooms,
      ),
    },
  });
  await recordAudit(tx, access, {
    action: "departure.rooming-issued",
    entityType: "departure",
    entityId: departureId,
    after: { stayId, number: issued.number },
  });
  return { documentId: issued.id, number: issued.number };
}

/** A cell for a spreadsheet: quoted, and a formula's first character is defused, so a name can't run in Excel. */
const cell = (value: string) => `"${/^[=+\-@\t\r]/.test(value) ? "'" : ""}${value.replaceAll('"', '""')}"`;

/** The stay's rooming list as a CSV: hotel, dates, room, guest and what they asked for. */
export async function roomingCsvOf(tx: OrgTx, stayId: string): Promise<{ filename: string; content: string }> {
  const { stay } = await stayRooming(tx, stayId);
  const rows = filledRooms(stay).flatMap((room) =>
    room.travellers.map((traveller) => [
      stay.hotelName,
      stay.checkIn,
      stay.checkOut,
      `${room.label}${room.groundFloor ? " (ground floor)" : ""}`,
      traveller.name,
      requestWords[traveller.roomRequest],
      traveller.roomNote,
    ]),
  );
  const header = ["Hotel", "Check-in", "Check-out", "Room", "Guest", "Request", "Note"];
  const slug = stay.hotelName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 40);
  return {
    filename: `rooming-${slug === "" ? "hotel" : slug}-${stay.checkIn}.csv`,
    content: `${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`,
  };
}
