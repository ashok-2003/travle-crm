// Leads as the api answers them, for the lead screens' tests: a list row, a page, the counts and a lead's page, each
// with the mockup's Rahul Sharma unless a test says otherwise.
import type {
  LeadCounts,
  LeadDetail,
  LeadListItem,
  LeadListPage,
  TimelineEntry,
  TimelinePage,
} from "@travel-crm/contracts/crm";
import { owner, salesperson } from "./screen";

export const ids = {
  rahul: "0199e7a0-0000-7000-8000-000000000a01",
  sneha: "0199e7a0-0000-7000-8000-000000000a02",
  priya: "0199e7a0-0000-7000-8000-000000000a03",
  person: "0199e7a0-0000-7000-8000-000000000b01",
  otherPerson: "0199e7a0-0000-7000-8000-000000000b02",
  kashmir: "0199e7a0-0000-7000-8000-000000000c01",
  goa: "0199e7a0-0000-7000-8000-000000000c02",
  task: "0199e7a0-0000-7000-8000-000000000d01",
  otherTask: "0199e7a0-0000-7000-8000-000000000d02",
  entry: "0199e7a0-0000-7000-8000-000000000e01",
} as const;

export const people = { [owner.user.id]: owner.user.name, [salesperson.user.id]: salesperson.user.name };

export function aListItem(overrides: Partial<LeadListItem> = {}): LeadListItem {
  return {
    id: ids.rahul,
    person: { name: "Rahul Sharma", phone: "+919876543210" },
    returning: false,
    stage: "new",
    trip: { destinationName: "Kashmir", when: { kind: "month", month: "2026-12" }, adults: 2, childrenCount: 1 },
    source: "phone_call",
    ownerUserId: owner.user.id,
    budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "per_person" },
    createdAt: "2026-10-16T05:18:00.000Z",
    next: { awaitingReplySince: "2026-10-16T05:18:00.000Z", task: null },
    ...overrides,
  };
}

export function aPage(items: LeadListItem[], nextCursor: string | null = null): { data: LeadListPage } {
  return { data: { items, nextCursor, people } };
}

export const counts: LeadCounts = { open: 16, new: 3, contacted: 5, quote_sent: 2, booking_requested: 6 };

export function aLead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: ids.rahul,
    stage: "new",
    reopenStage: null,
    lostReason: null,
    stageChangedAt: "2026-10-16T05:12:00.000Z",
    firstReplyAt: null,
    returning: false,
    callCount: 0,
    person: {
      id: ids.person,
      name: "Rahul Sharma",
      phone: "+919876543210",
      email: "rahul.s@gmail.com",
      instagramHandle: null,
    },
    trip: {
      destination: { id: ids.kashmir, name: "Kashmir" },
      when: { kind: "month", month: "2026-12" },
      adults: 2,
      childrenAges: [7],
      budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "per_person" },
      departureCity: "Delhi",
      tripType: "family",
      hotelCategory: "4_star",
      food: "veg",
      roomType: null,
    },
    source: "phone_call",
    sourceDetail: null,
    ownerUserId: owner.user.id,
    createdBy: salesperson.user.id,
    createdAt: "2026-10-16T05:12:00.000Z",
    work: [],
    people,
    ...overrides,
  };
}

export function anEntry(entry: Partial<TimelineEntry> & Pick<TimelineEntry, "kind">): TimelineEntry {
  return {
    id: ids.entry,
    occurredAt: "2026-10-16T05:12:00.000Z",
    actorUserId: salesperson.user.id,
    ...entry,
  } as TimelineEntry;
}

export function aTimeline(entries: TimelineEntry[], nextCursor: string | null = null): { data: TimelinePage } {
  return { data: { entries, nextCursor, people } };
}
