// What the lite turn reads about the customer's lead and the trips on offer: the lead's card and the team's last lines,
// the facts with what a person typed on the lead put first, the bookings the chat and the person already have, and the
// group packages the AI may sell, each with its starting price.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import type { LeadStage, TravelWhen } from "@travel-crm/contracts/crm";
import { roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { tripFieldValues } from "../../crm/index.js";
import { parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { valueHash } from "../fill/values.js";
import { mayBePayment } from "../payment-likely.js";
import type { DecideInput } from "./decide/decide.js";
import { aiFieldPaths, type TripField } from "./lead-writes.js";
import { priceOf } from "./lookups/package-reads.js";
import type { LeadCardFacts, PackageIndexEntry, TimelineLine } from "./types.js";

const TIMELINE = 3;
const PICKUP_MAX = 60;
const FOLDED: TripField[] = ["when", "adults", "children_ages", "departure_city", "room_type"];

const roomOf = (value: string | null): RoomType | null => roomTypes.find((type) => type === value) ?? null;

/** The group packages the AI may sell today, in their order, each with its lowest price per person. */
export async function packageIndexOf(
  tx: OrgTx,
  organizationId: string,
  today: CalendarDate,
  now: Date,
): Promise<PackageIndexEntry[]> {
  const ids = (await sellablePackages(tx, organizationId, today))
    .filter((one) => one.kind === "group")
    .map((one) => one.id);
  const rows = await tx.quoteTemplate.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      nights: true,
      startCity: true,
      destinationId: true,
      destination: { select: { name: true } },
    },
  });
  const nothingKnown = liteFacts.parse({ agent: "lite" });
  const index: PackageIndexEntry[] = [];
  // One step at a time: a transaction runs one query at once.
  for (const id of ids) {
    const row = rows.find((one) => one.id === id);
    if (row === undefined) continue;
    const { fromPaise } = await priceOf(tx, id, nothingKnown, today, now);
    index.push({
      id,
      title: row.title,
      place: row.destination?.name ?? null,
      destinationId: row.destinationId,
      nights: row.nights,
      startCity: row.startCity,
      fromPaise,
    });
  }
  return index;
}

/** The lead's trip values a person typed: those with no AI row whose hash the value still matches. */
async function typedByPerson(tx: OrgTx, leadId: string): Promise<Partial<Record<TripField, unknown>>> {
  const current = await tripFieldValues(tx, leadId);
  if (current === null) return {};
  const rows = await tx.leadAiField.findMany({ where: { leadId }, select: { field: true, valueHash: true } });
  const typed: Partial<Record<TripField, unknown>> = {};
  for (const field of FOLDED) {
    const value = current[field];
    const theAis = rows.some((row) => row.field === field && row.valueHash === valueHash(aiFieldPaths[field], value));
    if (value !== null && !theAis) typed[field] = value;
  }
  return typed;
}

/** The facts with a person's values in place of the chat's: the team knows better, and the agent never asks again. */
function withTyped(facts: LiteFacts, typed: Partial<Record<TripField, unknown>>): LiteFacts {
  const next = { ...facts };
  const when = typed.when as TravelWhen | undefined;
  if (when?.kind === "dates" || when?.kind === "month") {
    const day = when.kind === "dates" ? when.from : null;
    const month = when.kind === "dates" ? when.from.slice(0, 7) : when.month;
    // Another day is another departure, and another price.
    if (day !== next.day || month !== next.month) Object.assign(next, { day, month, departureId: null, quoted: null });
  }
  const adults = typed.adults as number | undefined;
  if (adults !== undefined && adults >= 1) next.adults = adults;
  const ages = typed.children_ages as number[] | undefined;
  if (ages !== undefined) next.children = { count: ages.length, ages };
  const city = typed.departure_city as string | undefined;
  if (city !== undefined) next.pickupCity = city.slice(0, PICKUP_MAX);
  const room = roomOf((typed.room_type as string | undefined) ?? null);
  if (room !== null) next.roomType = room;
  return next;
}

export interface LeadPart {
  leadId: string | null;
  leadStage: LeadStage | null;
  card: LeadCardFacts | null;
  timeline: TimelineLine[];
  facts: LiteFacts;
}

/** The open lead as the prompt shows it, and the facts with its person-typed values folded in. */
export async function leadPartOf(
  tx: OrgTx,
  leadId: string | null,
  input: { facts: LiteFacts; name: string | null; index: PackageIndexEntry[] },
): Promise<LeadPart> {
  const lead =
    leadId === null
      ? null
      : await tx.lead.findUnique({
          where: { id: leadId },
          select: {
            stage: true,
            adults: true,
            childrenAges: true,
            departureCity: true,
            roomType: true,
            travelKind: true,
            travelStart: true,
            travelMonth: true,
            destination: { select: { name: true } },
          },
        });
  if (leadId === null || lead === null)
    return { leadId: null, leadStage: null, card: null, timeline: [], facts: input.facts };
  const facts = withTyped(input.facts, await typedByPerson(tx, leadId));
  const day = (at: Date) => parseCalendarDate(at.toISOString().slice(0, 10));
  const when =
    lead.travelKind === "dates" && lead.travelStart !== null
      ? { day: day(lead.travelStart) }
      : lead.travelKind === "month" && lead.travelMonth !== null
        ? { month: lead.travelMonth.toISOString().slice(0, 7) }
        : null;
  const stage = lead.stage as LeadStage;
  const card: LeadCardFacts = {
    name: input.name,
    stage,
    packageTitle: input.index.find((entry) => entry.id === facts.packageId)?.title ?? null,
    place: lead.destination?.name ?? null,
    when,
    adults: lead.adults,
    childrenAges: lead.childrenAges,
    pickupCity: lead.departureCity,
    roomType: roomOf(lead.roomType),
  };
  // The team's own lines: the AI's notes and stage moves are already in the summary and the card.
  const notes = await tx.leadNote.findMany({
    where: { leadId, byAi: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TIMELINE,
    select: { body: true, createdAt: true },
  });
  const stages = await tx.leadTimelineEntry.findMany({
    where: { leadId, kind: "stage-changed", byAi: false, stage: { not: null } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: TIMELINE,
    select: { stage: true, occurredAt: true },
  });
  const timeline: TimelineLine[] = [
    ...notes.map((note) => ({ at: note.createdAt, kind: "note" as const, text: note.body })),
    ...stages.map((entry) => ({ at: entry.occurredAt, kind: "stage" as const, text: entry.stage ?? "" })),
  ];
  return { leadId, leadStage: stage, card, timeline, facts };
}

export interface BookingPart {
  openBooking: DecideInput["openBooking"];
  hasBooking: boolean;
  mayBePayment: boolean;
}

/**
 * The chat's own AI booking still waiting on its payment, and whether the person already has a booking: a requested,
 * confirmed or completed one, or a confirmed AI booking, on any of their leads. The chat's open AI booking is not one:
 * it is the sale this chat is in.
 */
export async function bookingPartOf(
  tx: OrgTx,
  chat: { id: string; personId: string | null },
  leadId: string | null,
  now: Date,
): Promise<BookingPart> {
  const open = await tx.aiBooking.findFirst({
    where: { conversationId: chat.id, status: { in: ["awaiting_payment", "proof_received"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, expectedPaise: true },
  });
  const openBooking =
    open === null
      ? null
      : {
          id: open.id,
          status: open.status === "proof_received" ? ("proof_received" as const) : ("awaiting_payment" as const),
          expectedPaise: Number(open.expectedPaise ?? 0n),
        };
  const leadIds =
    chat.personId === null
      ? []
      : (await tx.lead.findMany({ where: { personId: chat.personId }, select: { id: true } })).map((one) => one.id);
  const booked =
    leadIds.length > 0 &&
    ((await tx.booking.findFirst({
      where: { leadId: { in: leadIds }, status: { in: ["requested", "confirmed", "completed"] } },
      select: { id: true },
    })) !== null ||
      (await tx.aiBooking.findFirst({
        where: { leadId: { in: leadIds }, status: "confirmed" },
        select: { id: true },
      })) !== null);
  return {
    openBooking,
    hasBooking: booked,
    mayBePayment: await mayBePayment(tx, { conversationId: chat.id, leadId, at: now }),
  };
}
