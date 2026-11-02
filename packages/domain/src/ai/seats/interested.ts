// "Find interested people" for a departure's empty seats (release ai3): a plain query, no AI. Leads of the last 12 months
// whose destination is the departure's, who are not booked, holding or waiting on it, whose person has a phone to message and
// is not blocked, has recorded no opt-out (marketing or WhatsApp consent withdrawn), and was not offered this departure in
// the last 14 days, within the viewer's own leads. One lead for each person (the newest), the newest enquiries first and,
// among enquiries of the same month, the better score first; at most 50 are shown.
import {
  INTERESTED_PEOPLE_SHOWN,
  OFFER_PAUSE_DAYS,
  type InterestedPeople,
  type InterestedPerson,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { countsOf, departureSettingsOf, seatsSoldAndHeld, stateOf, type DepartureRow } from "../../departures/index.js";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../../identity/index.js";
import { addDays, calendarDateIn, DomainError, parseCalendarDate } from "../../kernel/index.js";

/** Candidates read before the rules that need other tables are applied. */
const CANDIDATES_MAX = 600;

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export interface Candidate extends InterestedPerson {
  /** Ayush's score of the lead, to rank by; not shown. */
  score: number | null;
  createdAt: Date;
}

/** The departure must be Open or Filling fast and have a destination to match leads by; otherwise a refusal in words. */
export async function assertOfferable(tx: OrgTx, departure: DepartureRow, now: Date): Promise<void> {
  const settings = await departureSettingsOf(tx);
  const sold = (await seatsSoldAndHeld(tx, [departure.id], now)).get(departure.id) ?? { sold: 0, held: 0 };
  const state = stateOf(departure, countsOf(departure.seatsTotal, sold.sold, sold.held), settings.fillingFastPercent);
  if (state === "closed" || state === "cancelled") {
    throw new DomainError("CONFLICT", "DEPARTURE_NOT_OPEN", "This departure is closed or cancelled");
  }
  if (state === "full") throw new DomainError("CONFLICT", "SEATS_NONE_FREE", "This departure has no empty seats");
  if (departure.destinationId === null) {
    throw new DomainError("CONFLICT", "DEPARTURE_NEEDS_DESTINATION", "Give the departure a destination first");
  }
}

const travelling = (lead: {
  travelKind: string;
  travelStart: Date | null;
  travelEnd: Date | null;
  travelMonth: Date | null;
}): string | null => {
  if (lead.travelKind === "dates" && lead.travelStart !== null) {
    return lead.travelEnd === null
      ? dayFormat.format(lead.travelStart)
      : `${dayFormat.format(lead.travelStart)} to ${dayFormat.format(lead.travelEnd)}`;
  }
  if (lead.travelKind === "month" && lead.travelMonth !== null) return monthFormat.format(lead.travelMonth);
  return lead.travelKind === "flexible" ? "flexible dates" : null;
};

/** The people who may be offered this departure's seats, best first. `onlyLeadId` asks about one lead (null when it may not be offered). */
export async function offerableLeads(
  tx: OrgTx,
  access: MemberAccess,
  departure: DepartureRow,
  now: Date,
  onlyLeadId?: string,
): Promise<Candidate[]> {
  if (departure.destinationId === null) return [];
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  const today = calendarDateIn(now, timeZone);
  const since = new Date(`${addDays(parseCalendarDate(today), -365)}T00:00:00Z`);
  const pauseStart = new Date(now.getTime() - OFFER_PAUSE_DAYS * 86_400_000);
  const rows = await tx.lead.findMany({
    where: {
      ...scopeFilter(access, "leads:view", "ownerUserId"),
      ...(onlyLeadId === undefined ? {} : { id: onlyLeadId }),
      destinationId: departure.destinationId,
      createdAt: { gte: since },
      stage: { not: "not_a_lead" },
      person: { is: { phoneE164: { not: null } } },
      bookings: {
        none: { departureId: departure.id, deletedAt: null, status: { in: ["requested", "confirmed", "completed"] } },
      },
      departureHolds: { none: { departureId: departure.id, status: "active" } },
      departureWaitlist: { none: { departureId: departure.id } },
      departureOffers: { none: { departureId: departure.id, sentAt: { gte: pauseStart } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATES_MAX,
    select: {
      id: true,
      createdAt: true,
      travelKind: true,
      travelStart: true,
      travelEnd: true,
      travelMonth: true,
      adults: true,
      childrenAges: true,
      destination: { select: { name: true } },
      person: { select: { id: true, name: true, phoneE164: true, email: true, instagramHandle: true } },
      aiInsights: { select: { score: true, label: true }, take: 1 },
    },
  });
  if (rows.length === 0) return [];
  const personIds = [...new Set(rows.map((row) => row.person.id))];
  const contacts = (kind: "phone" | "email" | "instagram", values: (string | null)[]) => ({
    kind,
    value: { in: values.filter((value): value is string => value !== null) },
  });
  const [blocked, consents] = await Promise.all([
    tx.blockedContact.findMany({
      where: {
        OR: [
          contacts(
            "phone",
            rows.map((row) => row.person.phoneE164),
          ),
          contacts(
            "email",
            rows.map((row) => row.person.email),
          ),
          contacts(
            "instagram",
            rows.map((row) => row.person.instagramHandle),
          ),
        ],
      },
      select: { kind: true, value: true },
    }),
    tx.personConsent.findMany({
      where: { personId: { in: personIds }, purpose: { in: ["marketing", "whatsapp"] } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      select: { personId: true, purpose: true, action: true },
    }),
  ]);
  const blockedValues = new Set(blocked.map((entry) => `${entry.kind}:${entry.value}`));
  // The newest row of each purpose decides; one withdrawn is an opt-out.
  const decided = new Set<string>();
  const optedOut = new Set<string>();
  for (const row of consents) {
    const key = `${row.personId}:${row.purpose}`;
    if (decided.has(key)) continue;
    decided.add(key);
    if (row.action === "withdrawn") optedOut.add(row.personId);
  }
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const { person } = row;
    if (person.phoneE164 === null || seen.has(person.id) || optedOut.has(person.id)) continue;
    if (
      blockedValues.has(`phone:${person.phoneE164}`) ||
      (person.email !== null && blockedValues.has(`email:${person.email}`)) ||
      (person.instagramHandle !== null && blockedValues.has(`instagram:${person.instagramHandle}`))
    ) {
      continue;
    }
    seen.add(person.id);
    const insight = row.aiInsights[0];
    candidates.push({
      leadId: row.id,
      name: person.name,
      phone: person.phoneE164,
      destination: row.destination?.name ?? null,
      travelling: travelling(row),
      partySize: row.adults === null ? null : row.adults + row.childrenAges.length,
      enquiredOn: calendarDateIn(row.createdAt, timeZone),
      label: insight?.label === "hot" || insight?.label === "warm" || insight?.label === "cold" ? insight.label : null,
      score: insight?.score ?? null,
      createdAt: row.createdAt,
    });
  }
  return candidates;
}

/** Newest enquiries first by month, then the better score, then the newest. */
const ranked = (candidates: readonly Candidate[]): Candidate[] =>
  [...candidates].sort(
    (a, b) =>
      b.enquiredOn.slice(0, 7).localeCompare(a.enquiredOn.slice(0, 7)) ||
      (b.score ?? -1) - (a.score ?? -1) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

export async function findInterestedPeople(
  tx: OrgTx,
  access: MemberAccess,
  departure: DepartureRow,
  now: Date,
): Promise<InterestedPeople> {
  await assertOfferable(tx, departure, now);
  const all = ranked(await offerableLeads(tx, access, departure, now));
  return {
    people: all.slice(0, INTERESTED_PEOPLE_SHOWN).map((one) => ({
      leadId: one.leadId,
      name: one.name,
      phone: one.phone,
      destination: one.destination,
      travelling: one.travelling,
      partySize: one.partySize,
      enquiredOn: one.enquiredOn,
      label: one.label,
    })),
    more: all.length > INTERESTED_PEOPLE_SHOWN,
  };
}
