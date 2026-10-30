// What staff fill in for the trip (spec 2.4): the essentials (where and when to report, the driver or guide, the emergency
// contact) and the stays (a hotel with its dates), a voucher for each stay and the itinerary PDF. Vouchers and the PDF are
// numbered documents through the documents module and frozen when issued; a change shows the old one as out of date and
// the old one stays in the list. Nothing is issued by itself: each issue takes a document number.
import {
  ITINERARY_DOCUMENT_PREFIX,
  VOUCHER_DOCUMENT_PREFIX,
  type IssueDocumentInput,
} from "@travel-crm/contracts/documents";
import type { SaveEssentialsInput, SaveStayInput } from "@travel-crm/contracts/bookings";
import { createHash } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { issueDocument } from "../documents/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, formatMoney, money } from "../kernel/index.js";
import { quoteDay } from "@travel-crm/contracts/quotes";
import { rebuildReminders } from "./reminders.js";
import {
  assertConfirmed,
  assertOpen,
  asDate,
  dayOf,
  findBookingForChange,
  paidOnQuote,
  type BookingRow,
} from "./rows.js";
import { recordBookingEvent } from "./timeline.js";

type Branding = IssueDocumentInput["branding"];

const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 3)}...`);
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const words = (day: string) => dayWords.format(new Date(`${day}T00:00:00Z`));

export async function saveEssentials(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveEssentialsInput,
  now: Date,
): Promise<void> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  const { bookingId, ...essentials } = input;
  await tx.booking.update({ where: { id: bookingId }, data: essentials });
  // The reporting reminder reads the essentials.
  if (booking.status === "confirmed") await rebuildReminders(tx, booking.id, now);
  await recordAudit(tx, access, { action: "booking.essentials-saved", entityType: "booking", entityId: booking.id });
}

export async function saveStay(tx: OrgTx, access: MemberAccess, input: SaveStayInput): Promise<{ stayId: string }> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertOpen(booking);
  const data = {
    name: input.name,
    address: input.address,
    mapUrl: input.mapUrl,
    checkIn: asDate(input.checkIn),
    checkOut: asDate(input.checkOut),
    notes: input.notes,
  };
  let stayId: string;
  if (input.stayId === undefined) {
    if ((await tx.bookingStay.count({ where: { bookingId: booking.id } })) >= 30) {
      throw new DomainError("LIMIT_REACHED", "TOO_MANY_STAYS", "A booking has thirty stays at most");
    }
    const position = await tx.bookingStay.count({ where: { bookingId: booking.id } });
    stayId = (await tx.bookingStay.create({ data: { ...data, bookingId: booking.id, position }, select: { id: true } }))
      .id;
  } else {
    const found = await tx.bookingStay.findFirst({
      where: { id: input.stayId, bookingId: booking.id },
      select: { id: true },
    });
    if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such stay");
    await tx.bookingStay.update({ where: { id: found.id }, data });
    stayId = found.id;
  }
  await recordAudit(tx, access, {
    action: "booking.stay-saved",
    entityType: "booking",
    entityId: booking.id,
    after: { stayId },
  });
  return { stayId };
}

export async function removeStay(tx: OrgTx, access: MemberAccess, stayId: string): Promise<void> {
  const stay = await tx.bookingStay.findUnique({ where: { id: stayId }, select: { bookingId: true } });
  if (stay === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such stay");
  const booking = await findBookingForChange(tx, access, stay.bookingId);
  assertOpen(booking);
  await tx.bookingStay.delete({ where: { id: stayId } });
  await recordAudit(tx, access, {
    action: "booking.stay-removed",
    entityType: "booking",
    entityId: booking.id,
    before: { stayId },
  });
}

const travellerNames = async (tx: OrgTx, bookingId: string) =>
  (
    await tx.bookingTraveller.findMany({
      where: { bookingId, name: { not: "" } },
      orderBy: { position: "asc" },
      select: { name: true },
    })
  ).map((row) => row.name);

interface StayRow {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  checkIn: Date;
  checkOut: Date;
  notes: string;
}

/** What a voucher is made from: the stay and the travellers named on it. A different fingerprint means it is out of date. */
export const voucherFingerprint = (booking: Pick<BookingRow, "number">, stay: StayRow, names: readonly string[]) =>
  fingerprint({
    number: booking.number,
    stay: [stay.name, stay.address, stay.mapUrl, stay.notes, dayOf(stay.checkIn), dayOf(stay.checkOut)],
    names,
  });

/** Issues the voucher for a stay as it is now; the one issued before is given back when nothing changed since. */
export async function issueVoucher(
  tx: OrgTx,
  access: MemberAccess,
  stayId: string,
  branding: Branding,
  now: Date,
): Promise<{ documentId: string; number: string }> {
  const found = await tx.bookingStay.findUnique({ where: { id: stayId }, select: { bookingId: true } });
  if (found === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such stay");
  const booking = await findBookingForChange(tx, access, found.bookingId);
  assertConfirmed(booking);
  const stay = await tx.bookingStay.findUniqueOrThrow({
    where: { id: stayId },
    select: {
      id: true,
      name: true,
      address: true,
      mapUrl: true,
      checkIn: true,
      checkOut: true,
      notes: true,
      voucherDocumentId: true,
      voucherFingerprint: true,
    },
  });
  const names = await travellerNames(tx, booking.id);
  const stamp = voucherFingerprint(booking, stay, names);
  if (stay.voucherDocumentId !== null && stay.voucherFingerprint === stamp) {
    const kept = await tx.issuedDocument.findUniqueOrThrow({
      where: { id: stay.voucherDocumentId },
      select: { number: true },
    });
    return { documentId: stay.voucherDocumentId, number: kept.number };
  }
  const nights = Math.max(0, Math.round((stay.checkOut.getTime() - stay.checkIn.getTime()) / 86_400_000));
  const notes = [
    stay.notes,
    stay.mapUrl === "" ? "" : `Map: ${stay.mapUrl}`,
    booking.emergencyPhone === ""
      ? ""
      : `Agency emergency contact: ${booking.emergencyName} ${booking.emergencyPhone}`.trim(),
  ]
    .filter((part) => part !== "")
    .join("\n");
  const issued = await issueDocument(
    tx,
    access,
    {
      template: "sample",
      prefix: VOUCHER_DOCUMENT_PREFIX,
      content: {
        title: cut(`Hotel voucher: ${stay.name}`, 80),
        recipient: {
          name: cut(booking.lead.person.name, 120),
          lines: [
            `Booking ${booking.number}`,
            ...(names.length === 0 ? [] : [cut(`Travellers: ${names.join(", ")}`, 120)]),
          ].slice(0, 6),
        },
        rows: [
          {
            description: cut(stay.name, 500),
            ...(stay.address === "" ? {} : { detail: cut(stay.address, 300) }),
            amount: `${String(nights)} night${nights === 1 ? "" : "s"}`,
          },
          { description: "Check-in", amount: words(dayOf(stay.checkIn)) },
          { description: "Check-out", amount: words(dayOf(stay.checkOut)) },
        ],
        totals: [],
        ...(notes === "" ? {} : { notes: cut(notes, 2000) }),
      },
      branding,
    },
    now,
  );
  await tx.bookingStay.update({
    where: { id: stay.id },
    data: { voucherDocumentId: issued.id, voucherFingerprint: stamp },
  });
  await recordAudit(tx, access, {
    action: "booking.voucher-issued",
    entityType: "booking",
    entityId: booking.id,
    after: { stayId: stay.id, number: issued.number },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "voucher-issued" });
  return { documentId: issued.id, number: issued.number };
}

/** What the itinerary PDF is made from: the plan (the quote's version), the essentials, the stays and the vouchers. */
export async function tripFingerprint(tx: OrgTx, booking: BookingRow): Promise<string> {
  const stays = await tx.bookingStay.findMany({ where: { bookingId: booking.id }, orderBy: { position: "asc" } });
  return fingerprint({
    version: booking.quote.version,
    essentials: [
      booking.reportingTime,
      booking.reportingPlace,
      booking.driverName,
      booking.driverPhone,
      booking.emergencyName,
      booking.emergencyPhone,
    ],
    stays: stays.map((stay) => [
      stay.name,
      stay.address,
      stay.notes,
      dayOf(stay.checkIn),
      dayOf(stay.checkOut),
      stay.voucherDocumentId,
    ]),
  });
}

/** Issues the itinerary PDF as the trip stands now; the one issued before is given back when nothing changed since. */
export async function prepareTripPdf(
  tx: OrgTx,
  access: MemberAccess,
  bookingId: string,
  branding: Branding,
  now: Date,
): Promise<{ documentId: string; number: string }> {
  const booking = await findBookingForChange(tx, access, bookingId);
  assertConfirmed(booking);
  const stamp = await tripFingerprint(tx, booking);
  if (booking.tripPdfDocumentId !== null && booking.tripPdfFingerprint === stamp) {
    const kept = await tx.issuedDocument.findUniqueOrThrow({
      where: { id: booking.tripPdfDocumentId },
      select: { number: true },
    });
    return { documentId: booking.tripPdfDocumentId, number: kept.number };
  }
  const stays = await tx.bookingStay.findMany({ where: { bookingId }, orderBy: { position: "asc" } });
  const vouchers = await tx.issuedDocument.findMany({
    where: { id: { in: stays.flatMap((stay) => stay.voucherDocumentId ?? []) } },
    select: { number: true },
  });
  const plan = quoteDay.array().catch([]).parse(booking.quote.days);
  const total = Number(booking.quote.totalPaise);
  const paid = await paidOnQuote(tx, booking.quoteId);
  const essentials = [
    booking.reportingPlace === "" && booking.reportingTime === null
      ? ""
      : `Report${booking.reportingTime === null ? "" : ` at ${booking.reportingTime}`}${booking.reportingPlace === "" ? "" : `, ${booking.reportingPlace}`}.`,
    booking.driverName === "" ? "" : `Driver or guide: ${booking.driverName} ${booking.driverPhone}`.trim(),
    booking.emergencyName === "" && booking.emergencyPhone === ""
      ? ""
      : `Emergency contact: ${booking.emergencyName} ${booking.emergencyPhone}`.trim(),
    vouchers.length === 0 ? "" : `Vouchers: ${vouchers.map((voucher) => voucher.number).join(", ")}`,
  ].filter((part) => part !== "");
  const rows = [
    ...plan.map((day, index) => ({
      description: cut(`Day ${String(index + 1)}: ${day.title}`, 500),
      ...(day.description === "" ? {} : { detail: cut(day.description, 300) }),
      amount:
        booking.startDate === null
          ? `Day ${String(index + 1)}`
          : words(dayOf(new Date(booking.startDate.getTime() + index * 86_400_000))),
    })),
    ...stays.map((stay) => ({
      description: cut(`Stay: ${stay.name}`, 500),
      ...(stay.address === "" ? {} : { detail: cut([stay.address, stay.notes].filter(Boolean).join(" · "), 300) }),
      amount: cut(`${words(dayOf(stay.checkIn))} - ${words(dayOf(stay.checkOut))}`, 24),
    })),
  ];
  const issued = await issueDocument(
    tx,
    access,
    {
      template: "sample",
      prefix: ITINERARY_DOCUMENT_PREFIX,
      content: {
        title: cut(`Itinerary: ${booking.quote.title}`, 80),
        recipient: {
          name: cut(booking.lead.person.name, 120),
          lines: [
            `Booking ${booking.number}`,
            ...(booking.startDate === null ? [] : [`Travel from ${words(dayOf(booking.startDate))}`]),
          ],
        },
        rows: rows.length > 0 ? rows : [{ description: cut(booking.quote.title, 500), amount: "Your trip" }],
        totals: [
          { label: "Trip total", amount: formatMoney(money(total)) },
          { label: "Paid when issued", amount: formatMoney(money(paid)) },
          { label: "Balance when issued", amount: formatMoney(money(Math.max(0, total - paid))), emphasis: true },
        ],
        ...(essentials.length === 0 ? {} : { notes: cut(essentials.join("\n"), 2000) }),
      },
      branding,
    },
    now,
  );
  await tx.booking.update({
    where: { id: bookingId },
    data: { tripPdfDocumentId: issued.id, tripPdfFingerprint: stamp },
  });
  await recordAudit(tx, access, {
    action: "booking.trip-pdf-prepared",
    entityType: "booking",
    entityId: bookingId,
    after: { number: issued.number },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId, event: "trip-pdf-prepared" });
  return { documentId: issued.id, number: issued.number };
}
