// Today's items as the api sends them, for the Today and Home tests: the mockup's day, Friday 16 October 2026 at
// 10:00 in India (04:30 UTC), with Sneha's follow-up overdue since yesterday, Vikram's since this morning, Rahul's new
// lead waiting 12 minutes, and Priya's follow-up due at 4:00 pm.
import type { LeadBrief, TodayItem, TodaySummary } from "@travel-crm/contracts/today";
import type { Task } from "@travel-crm/contracts/tasks";

type TaskItem = Extract<TodayItem, { kind: "task" }>;
type NewLeadItem = Extract<TodayItem, { kind: "new-lead" }>;

/** 10:00 on Friday 16 October 2026 in India. */
export const now = new Date("2026-10-16T04:30:00Z");

const owner = "0199a000-0000-7000-8000-000000000001";

export function aLead(overrides: Partial<LeadBrief> = {}): LeadBrief {
  return {
    id: "0199e7a0-0000-7000-8000-0000000000a1",
    personName: "Sneha Iyer",
    phone: "+919812345678",
    trip: { destinationName: "Goa", when: { kind: "month", month: "2027-01" }, adults: 6, childrenCount: 0 },
    source: "instagram",
    ...overrides,
  };
}

export function aTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0199e7a0-0000-7000-8000-0000000000f1",
    kind: "follow-up",
    title: "Send Goa options",
    dueAt: "2026-10-15T11:30:00.000Z",
    firstDueAt: "2026-10-15T11:30:00.000Z",
    assigneeUserId: owner,
    record: { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000a1" },
    doneAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

/** Sneha's follow-up, due yesterday at 5:00 pm. */
export const snehaOverdue: TaskItem = { kind: "task", task: aTask(), lead: aLead(), booking: null };

/** Vikram's, due at 9:30 this morning; his trip isn't known yet. */
export const vikramOverdue: TaskItem = {
  kind: "task",
  task: aTask({
    id: "0199e7a0-0000-7000-8000-0000000000f2",
    title: "Send the revised Rajasthan quote",
    dueAt: "2026-10-16T04:00:00.000Z",
    record: { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000a2" },
  }),
  lead: aLead({
    id: "0199e7a0-0000-7000-8000-0000000000a2",
    personName: "Vikram Singh",
    phone: "+919811122233",
    trip: { destinationName: null, when: { kind: "unknown" }, adults: null, childrenCount: 0 },
    source: "walk_in",
  }),
  booking: null,
};

/** Rahul's new lead, in 12 minutes ago by phone. */
export const rahulNew: NewLeadItem = {
  kind: "new-lead",
  lead: aLead({
    id: "0199e7a0-0000-7000-8000-0000000000a3",
    personName: "Rahul Sharma",
    phone: "+919876543210",
    trip: { destinationName: "Kashmir", when: { kind: "month", month: "2026-12" }, adults: null, childrenCount: 0 },
    source: "phone_call",
  }),
  waitingSince: "2026-10-16T04:18:00.000Z",
};

/** Priya's follow-up, due at 4:00 pm today. */
export const priyaDue: TaskItem = {
  kind: "task",
  task: aTask({
    id: "0199e7a0-0000-7000-8000-0000000000f4",
    title: "Confirm Kedarnath dates",
    dueAt: "2026-10-16T10:30:00.000Z",
    record: { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000a4" },
  }),
  lead: aLead({
    id: "0199e7a0-0000-7000-8000-0000000000a4",
    personName: "Priya Nair",
    phone: "+919833344455",
    trip: {
      destinationName: "Kedarnath",
      when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
      adults: 4,
      childrenCount: 0,
    },
    source: "referral",
  }),
  booking: null,
};

/** A task of the member's own, on no lead, due at 6:00 pm. */
export const standaloneDue: TaskItem = {
  kind: "task",
  task: aTask({
    id: "0199e7a0-0000-7000-8000-0000000000f5",
    kind: "task",
    title: "Renew the IATA licence",
    dueAt: "2026-10-16T12:30:00.000Z",
    record: null,
  }),
  lead: null,
  booking: null,
};

/** The mockup's day: 8 things, 2 overdue, 3 new leads, 3 due today, and its top three. */
export const busyDay: TodaySummary = {
  day: "2026-10-16",
  counts: { overdue: 2, newLeads: 3, dueToday: 3, quoteOpened: 0, paymentsDue: 0, tripDetails: 0, departures: 0 },
  top: [snehaOverdue, rahulNew, priyaDue],
};

export const quietDay: TodaySummary = {
  day: "2026-10-16",
  counts: { overdue: 0, newLeads: 0, dueToday: 0, quoteOpened: 0, paymentsDue: 0, tripDetails: 0, departures: 0 },
  top: [],
};
