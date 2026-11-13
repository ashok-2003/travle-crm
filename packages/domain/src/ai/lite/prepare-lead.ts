// What the lite turn reads about the customer's lead and the trips on offer: the lead's card and the team's last lines,
// the facts with what a person typed on the lead put first, the bookings the chat and the person already have, and the
// group packages the AI may sell, each with its starting price.
import type { LiteFacts } from "@travel-crm/contracts/ai";
import type { LeadStage, TravelWhen } from "@travel-crm/contracts/crm";
import { roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { tripFieldValues } from "../../crm/index.js";
import { parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { openDepartureDetailsByPackage } from "../../departures/index.js";
import { seasonsByPackage } from "../../quotes/index.js";
import { valueHash } from "../fill/values.js";
import { mayBePayment } from "../payment-likely.js";
import type { DecideInput } from "./decide/decide.js";
import { aiFieldPaths, type TripField } from "./lead-writes.js";
import { lowestAdultPrice } from "./lookups/package-reads.js";
import type { TypedFields } from "./typed-lock.js";
import type { LeadCardFacts, PackageIndexEntry, TimelineLine } from "./types.js";

const TIMELINE = 3;
const PICKUP_MAX = 60;
const FOLDED: TripField[] = ["when", "adults", "children_ages", "departure_city", "room_type"];

const roomOf = (value: string | null): RoomType | null => roomTypes.find((type) => type === value) ?? null;

/**
 * The group packages the AI may sell today (`sellable`, read once for the turn), in their order, each with its lowest
 * price per person. Every package is priced from one read of the departures, their seats and the seasons, so the turn
 * costs the same however many packages the agency sells.
 */
export async function packageIndexOf(
  tx: OrgTx,
  sellable: readonly { id: string; kind: string }[],
  today: CalendarDate,
  now: Date,
): Promise<PackageIndexEntry[]> {
  const ids = sellable.filter((one) => one.kind === "group").map((one) => one.id);
  if (ids.length === 0) return [];
  const rows = await tx.quoteTemplate.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      nights: true,
      startCity: true,
      roomTypes: true,
      destinationId: true,
      destination: { select: { name: true } },
    },
  });
  const open = await openDepartureDetailsByPackage(tx, ids, today, now);
  const seasons = await seasonsByPackage(tx, ids);
  return ids.flatMap((id) => {
    const row = rows.find((one) => one.id === id);
    if (row === undefined) return [];
    const offered = row.roomTypes as RoomType[];
    return [
      {
        id,
        title: row.title,
        place: row.destination?.name ?? null,
        destinationId: row.destinationId,
        nights: row.nights,
        startCity: row.startCity,
        fromPaise: lowestAdultPrice(seasons.get(id) ?? [], open.get(id) ?? [], today, offered),
      },
    ];
  });
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
  // A month the facts already hold (alone, or as the month of the day the customer picked) changes nothing: else a day
  // in it would be let go every turn, and asked for again.
  const sameMonth = when?.kind === "month" && when.month === next.month;
  if ((when?.kind === "dates" || when?.kind === "month") && !sameMonth) {
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
  /** The lead's trip values a person typed: locked for the turn. */
  typed: TypedFields;
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
    return { leadId: null, leadStage: null, card: null, timeline: [], facts: input.facts, typed: {} };
  const typed = await typedByPerson(tx, leadId);
  const facts = withTyped(input.facts, typed);
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
  return { leadId, leadStage: stage, card, timeline, facts, typed };
}

export interface BookingPart {
  openBooking: DecideInput["openBooking"];
  hasBooking: boolean;
  mayBePayment: boolean;
}

/**
 * The chat's own AI booking still waiting on its payment, and whether the person has a booking still ahead of them: a
 * requested or confirmed one, or a confirmed AI booking whose departure is today or later, on any of their leads. A
 * trip that is over (a completed booking, an AI booking whose departure has gone) makes them a returning customer, and
 * the chat's open AI booking is the sale this chat is in: neither is one.
 */
export async function bookingPartOf(
  tx: OrgTx,
  chat: { id: string; personId: string | null },
  leadId: string | null,
  at: { now: Date; today: CalendarDate },
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
      where: { leadId: { in: leadIds }, status: { in: ["requested", "confirmed"] } },
      select: { id: true },
    })) !== null ||
      (await tx.aiBooking.findFirst({
        where: {
          leadId: { in: leadIds },
          status: "confirmed",
          quote: { departure: { startDate: { gte: new Date(`${at.today}T00:00:00Z`) } } },
        },
        select: { id: true },
      })) !== null);
  return {
    openBooking,
    hasBooking: booked,
    mayBePayment: await mayBePayment(tx, { conversationId: chat.id, leadId, at: at.now }),
  };
}
