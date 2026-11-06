// The booking a checked reply asks for: the quote at the total the customer was told, the seats held, and an AI booking
// that points at the quote and asks the advance, so plan 3's "Payments to check" can confirm it. The system acts, and any
// refusal throws so the turn rolls back and nothing is sent.
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, advanceLeadStage, noticeKey } from "../../crm/index.js";
import { createHoldFor, departureSettingsOf, makeGroupQuoteFor } from "../../departures/index.js";
import { DomainError, formatRupees, formatShortDay, systemActor } from "../../kernel/index.js";
import { uuidFromKey } from "../../jobs/index.js";
import { notify } from "../../notifications/index.js";
import { AI_BOOKING_KIND } from "../booking.js";
import type { ActDeps, ActInput } from "./act-types.js";
import { bookingPackage } from "./actions.js";

const refuse = (message: string) => new DomainError("CONFLICT", "AI_ACTION_REFUSED", message);

/** The chat's latest lead: the one a booking, a note and a follow-up belong to. */
export async function leadOfChat(tx: OrgTx, conversationId: string): Promise<string | null> {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: conversationId }, select: { personId: true } });
  if (chat?.personId == null) return null;
  const lead = await tx.lead.findFirst({
    where: { personId: chat.personId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return lead?.id ?? null;
}

/** Makes the quote, holds the seats and takes the booking. Returns the AI booking's id. */
export async function takeGroundedBooking(
  tx: OrgTx,
  deps: ActDeps,
  input: ActInput,
  leadId: string | null,
): Promise<string> {
  const one = bookingPackage(input.lookup);
  const departure = one?.chosenDeparture ?? null;
  const travellers = input.lookup.travellers;
  if (leadId === null || one === null || departure === null || travellers === null || one.total === null) {
    throw refuse("A booking needs a lead, a priced departure and the travellers");
  }
  const bookingId = uuidFromKey(`ai-booking:${input.token}`);
  // A repeat of the turn: its booking stands, and no second hold or quote is made.
  if ((await tx.aiBooking.findUnique({ where: { id: bookingId }, select: { id: true } })) !== null) return bookingId;
  const actor = systemActor(input.organizationId);
  // The quote first: it counts the seats held, so a hold of its own party would leave it too few.
  const quote = await makeGroupQuoteFor(
    tx,
    actor,
    { leadId, packageId: one.id, departureId: departure.id, rooms: input.facts.rooms },
    { supplierStateCode: deps.supplierStateCode, now: input.now },
    input.lookup.today,
  );
  if (Number(quote.totalPaise) !== one.total) {
    throw new DomainError("CONFLICT", "TOLD_TOTAL_CHANGED", "The quote does not match the total the customer was told");
  }
  await createHoldFor(
    tx,
    actor,
    {
      leadId,
      departureId: departure.id,
      seats: travellers,
      hours: (await departureSettingsOf(tx)).holdHours,
      note: "",
    },
    input.now,
  ).catch((error: unknown) => {
    // The lead holds seats here already (an earlier turn): they stand.
    if (!(error instanceof DomainError && error.reason === "HOLD_EXISTS")) throw error;
  });
  const day = formatShortDay(departure.startsOn, input.lookup.today);
  const total = formatRupees(one.total);
  const rooms = input.facts.rooms.map((room) => `${String(room.people)} ${room.roomType.replace("_", " ")}`).join(", ");
  const summary = `${one.title}, ${day}, ${String(travellers)} travellers`.slice(0, 300);
  const details = {
    package: one.title,
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
      expectedPaise: BigInt(one.advancePerPersonPaise ?? 0) * BigInt(travellers),
    },
  });
  await advanceLeadStage(tx, actor, { leadId, stage: "booking_requested" }, input.now);
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
  return bookingId;
}
