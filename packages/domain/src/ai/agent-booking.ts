// The booking an AI agent takes in its turn: the quote at the total the customer was told, the seats held, and an AI
// booking that points at the quote and asks the amount due, so "Payments to check" can confirm it. The system acts, and
// any refusal throws so the turn rolls back and nothing is sent.
import type { RoomBooking } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, advanceLeadStage, noticeKey } from "../crm/index.js";
import { createHoldFor, departureSettingsOf, makeGroupQuoteFor } from "../departures/index.js";
import { uuidFromKey } from "../jobs/index.js";
import { DomainError, formatRupees, formatShortDay, systemActor, type CalendarDate } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { AI_BOOKING_KIND, type BookingRecipients } from "./booking.js";

export interface AgentBookingInput {
  organizationId: string;
  conversationId: string;
  /** The turn's token: the booking's id is made from it, so a repeat of the turn finds the booking it took. */
  token: string;
  leadId: string;
  pkg: { id: string; title: string };
  departure: { id: string; startsOn: CalendarDate };
  /** The rooms the told total was for. */
  rooms: RoomBooking[];
  travellers: number;
  /** The total the customer was told: the quote must come to it. */
  toldTotalPaise: number;
  /** What the customer is asked to pay now: the advance for every traveller, or the whole total. */
  expectedPaise: bigint;
  today: CalendarDate;
  now: Date;
}

/**
 * When the lead's live hold on the departure ends: the one this booking took, or one taken before. A hold of fewer seats
 * than the party (staff held one, two now book) does not hold their seats, so it counts as none.
 */
async function heldUntil(
  tx: OrgTx,
  hold: { leadId: string; departureId: string; seats: number },
  now: Date,
): Promise<Date | null> {
  const live = await tx.departureHold.findFirst({
    where: {
      leadId: hold.leadId,
      departureId: hold.departureId,
      seats: { gte: hold.seats },
      status: "active",
      expiresAt: { gt: now },
    },
    select: { expiresAt: true },
  });
  return live?.expiresAt ?? null;
}

/**
 * Makes the quote, holds the seats and takes the booking. Returns the AI booking's id and when the seats are held until:
 * this hold's end, or that of the hold the lead already has on the departure; null when no live hold of the party's
 * seats is found.
 */
export async function takeAgentBooking(
  tx: OrgTx,
  deps: { recipients: BookingRecipients; supplierStateCode: string | null },
  input: AgentBookingInput,
): Promise<{ bookingId: string; holdExpiresAt: Date | null }> {
  const { leadId, departure, travellers, now } = input;
  const bookingId = uuidFromKey(`ai-booking:${input.token}`);
  const party = { leadId, departureId: departure.id, seats: travellers };
  // A repeat of the turn: its booking stands, and no second hold or quote is made.
  if ((await tx.aiBooking.findUnique({ where: { id: bookingId }, select: { id: true } })) !== null) {
    return { bookingId, holdExpiresAt: await heldUntil(tx, party, now) };
  }
  const actor = systemActor(input.organizationId);
  // The quote first: it counts the seats held, so a hold of its own party would leave it too few.
  const quote = await makeGroupQuoteFor(
    tx,
    actor,
    { leadId, packageId: input.pkg.id, departureId: departure.id, rooms: input.rooms },
    { supplierStateCode: deps.supplierStateCode, now },
    input.today,
  );
  if (Number(quote.totalPaise) !== input.toldTotalPaise) {
    throw new DomainError("CONFLICT", "TOLD_TOTAL_CHANGED", "The quote does not match the total the customer was told");
  }
  const held = await createHoldFor(
    tx,
    actor,
    {
      leadId,
      departureId: departure.id,
      seats: travellers,
      hours: (await departureSettingsOf(tx)).holdHours,
      note: "",
    },
    now,
  ).catch(async (error: unknown) => {
    // The lead holds seats here already (an earlier turn): they stand.
    if (!(error instanceof DomainError && error.reason === "HOLD_EXISTS")) throw error;
    return { expiresAt: await heldUntil(tx, party, now) };
  });
  const day = formatShortDay(departure.startsOn, input.today);
  const total = formatRupees(input.toldTotalPaise);
  const rooms = input.rooms.map((room) => `${String(room.people)} ${room.roomType.replaceAll("_", " ")}`).join(", ");
  const summary = `${input.pkg.title}, ${day}, ${String(travellers)} travellers`.slice(0, 300);
  const details = {
    package: input.pkg.title,
    dates: day,
    travellers: `${String(travellers)}: ${rooms}`,
    pickup: "",
    amount: total,
  };
  await tx.aiBooking.create({
    data: {
      id: bookingId,
      leadId,
      conversationId: input.conversationId,
      summary,
      details,
      quoteId: quote.id,
      expectedPaise: input.expectedPaise,
    },
  });
  await advanceLeadStage(tx, actor, { leadId, stage: "booking_requested", byAi: true }, now);
  await addAiLeadNote(
    tx,
    actor,
    leadId,
    [
      `Booking taken by the AI: ${summary}`,
      `Package: ${details.package}`,
      `Dates: ${details.dates}`,
      `Travellers: ${details.travellers}`,
      `Amount: ${details.amount}`,
      "Waiting for the payment proof.",
    ].join("\n"),
  );
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  await notify(tx, actor, {
    recipientUserIds: [
      ...new Set([
        ...(lead?.ownerUserId == null ? [] : [lead.ownerUserId]),
        ...(await deps.recipients(input.organizationId)),
      ]),
    ],
    sourceEventId: noticeKey(`ai-booking:${bookingId}`, AI_BOOKING_KIND),
    kind: AI_BOOKING_KIND,
    title: `New booking: ${lead?.person.name ?? "a customer"} said yes`.slice(0, 120),
    body: [summary, details.amount].join(" · ").slice(0, 300),
    link: `/leads/${leadId}`,
    channels: ["email", "push"],
  });
  return { bookingId, holdExpiresAt: held.expiresAt };
}
