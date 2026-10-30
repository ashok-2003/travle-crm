// Departures (release 7a): a group batch with a number of seats. The shapes the staff screens read: the list, and one
// departure with the bookings on it, the seats held for leads and the waitlist. Seats are worked out, never stored:
// sold = the heads of live Requested and Confirmed bookings, held = active holds, free = total - sold - held.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";
import { MAX_QUOTE_PAISE } from "../quotes/quotes.js";

export const departureStatuses = ["open", "closed", "cancelled"] as const;
export const departureStatus = z.enum(departureStatuses);
export type DepartureStatus = z.infer<typeof departureStatus>;

/** What staff and (in 7b) visitors read: Open, Filling fast, Full, Closed by staff, Cancelled. */
export const seatStates = ["open", "filling", "full", "closed", "cancelled"] as const;
export const seatState = z.enum(seatStates);
export type SeatState = z.infer<typeof seatState>;

export const holdStatuses = ["active", "released", "expired", "converted"] as const;
export const holdStatus = z.enum(holdStatuses);

export const MAX_SEATS = 1000;
/** A hold ending within this many hours shows red in Today. */
export const HOLD_ENDING_SOON_HOURS = 4;

const text = (max: number) => z.string().trim().max(max);

export const departureFields = {
  title: text(120).min(1),
  destinationId: recordId.nullable(),
  startDate: calendarDate,
  endDate: calendarDate,
  seatsTotal: z.int().min(0).max(MAX_SEATS),
  /** Per person, in paise, or null when each quote sets its own. */
  pricePaise: z.int().min(0).max(MAX_QUOTE_PAISE).nullable(),
  /** The last day a seat is sold, or null. */
  cutoffOn: calendarDate.nullable(),
  notes: text(1000),
};

const endsAfterStart = (value: { startDate: string; endDate: string }) => value.endDate >= value.startDate;
const cutoffBeforeStart = (value: { startDate: string; cutoffOn: string | null }) =>
  value.cutoffOn === null || value.cutoffOn <= value.startDate;
const cutoffMessage = { message: "The last day to book is after the trip starts", path: ["cutoffOn"] };
const endsAfterStartMessage = { message: "The last day is before the first", path: ["endDate"] };

export const createDepartureInput = z
  .strictObject(departureFields)
  .refine(endsAfterStart, endsAfterStartMessage)
  .refine(cutoffBeforeStart, cutoffMessage);
export type CreateDepartureInput = z.infer<typeof createDepartureInput>;
export const updateDepartureInput = z
  .strictObject({ departureId: recordId, ...departureFields })
  .refine(endsAfterStart, endsAfterStartMessage)
  .refine(cutoffBeforeStart, cutoffMessage);
export type UpdateDepartureInput = z.infer<typeof updateDepartureInput>;

export const departureIdInput = z.strictObject({ departureId: recordId });
export type DepartureIdInput = z.infer<typeof departureIdInput>;
export const setDepartureStatusInput = z.strictObject({
  departureId: recordId,
  status: z.enum(["open", "closed"]),
});
export const cancelDepartureInput = z.strictObject({ departureId: recordId, reason: text(500).min(1) });
export type CancelDepartureInput = z.infer<typeof cancelDepartureInput>;

export const departureFilters = ["upcoming", "past", "cancelled"] as const;
export const departureFilter = z.enum(departureFilters);
export type DepartureFilter = z.infer<typeof departureFilter>;
export const listDeparturesInput = z.strictObject({ filter: departureFilter });
export type ListDeparturesInput = z.infer<typeof listDeparturesInput>;
export const DEPARTURES_LIST_LIMIT = 100;

export const seatCounts = z.object({
  seatsTotal: z.int(),
  sold: z.int(),
  held: z.int(),
  /** Never below zero. */
  free: z.int(),
  /** How many heads are booked beyond the seats; zero unless a quote was accepted on a full departure. */
  overbookedBy: z.int(),
});
export type SeatCounts = z.infer<typeof seatCounts>;

export const departureSummary = z.object({
  id: recordId,
  title: z.string(),
  destinationName: z.string().nullable(),
  startDate: calendarDate,
  endDate: calendarDate,
  pricePaise: z.int().nullable(),
  status: departureStatus,
  state: seatState,
  ...seatCounts.shape,
});
export type DepartureSummary = z.infer<typeof departureSummary>;
export const departureList = z.array(departureSummary);

/** A booking on the departure, with how many travellers have filled their details. */
export const departureBooking = z.object({
  bookingId: recordId,
  number: z.string(),
  leadId: recordId,
  customerName: z.string(),
  status: z.enum(["requested", "confirmed"]),
  heads: z.int(),
  travellersComplete: z.int(),
});
export type DepartureBooking = z.infer<typeof departureBooking>;

/** A departure in brief, beside the booking or quote that is on it. */
export const departureRef = z.object({ id: recordId, title: z.string(), startDate: calendarDate });
export type DepartureRef = z.infer<typeof departureRef>;

export const departureHold = z.object({
  id: recordId,
  leadId: recordId,
  customerName: z.string(),
  seats: z.int(),
  expiresAt: z.iso.datetime(),
  note: z.string(),
  createdAt: z.iso.datetime(),
});
export type DepartureHold = z.infer<typeof departureHold>;

export const waitlistEntry = z.object({
  id: recordId,
  leadId: recordId,
  customerName: z.string(),
  seats: z.int(),
  createdAt: z.iso.datetime(),
});
export type WaitlistEntry = z.infer<typeof waitlistEntry>;

export const departureDetail = z.object({
  ...departureSummary.shape,
  destinationId: recordId.nullable(),
  cutoffOn: calendarDate.nullable(),
  notes: z.string(),
  cancelledReason: z.string().nullable(),
  bookings: z.array(departureBooking),
  holds: z.array(departureHold),
  waitlist: z.array(waitlistEntry),
});
export type DepartureDetail = z.infer<typeof departureDetail>;

export const createHoldInput = z.strictObject({
  departureId: recordId,
  leadId: recordId,
  seats: z.int().min(1).max(MAX_SEATS),
  /** How long to hold them; the agency's default (48 hours) when left out. */
  hours: z.int().min(1).max(720).optional(),
  note: text(300),
});
export type CreateHoldInput = z.infer<typeof createHoldInput>;
export const holdIdInput = z.strictObject({ holdId: recordId });
export const addWaitlistInput = z.strictObject({
  departureId: recordId,
  leadId: recordId,
  seats: z.int().min(1).max(MAX_SEATS),
});
export type AddWaitlistInput = z.infer<typeof addWaitlistInput>;
export const waitlistIdInput = z.strictObject({ waitlistId: recordId });

/** A hold or a lead's quote put on a departure. */
export const setQuoteDepartureInput = z.strictObject({ quoteId: recordId, departureId: recordId.nullable() });
export type SetQuoteDepartureInput = z.infer<typeof setQuoteDepartureInput>;
/** A lead's holds, for the lead's page. */
export const leadHoldsInput = z.strictObject({ leadId: recordId });
export const leadDeparture = z.object({
  departureId: recordId,
  title: z.string(),
  startDate: calendarDate,
  /** "hold" (seats held) or "waitlist". */
  kind: z.enum(["hold", "waitlist"]),
  seats: z.int(),
  expiresAt: z.iso.datetime().nullable(),
  holdId: recordId.nullable(),
});
export type LeadDeparture = z.infer<typeof leadDeparture>;
export const leadDepartureList = z.array(leadDeparture);

export const departureSettingsFields = {
  holdHours: z.int().min(1).max(720),
  fillingFastPercent: z.int().min(0).max(100),
  defaultRoomCapacity: z.int().min(1).max(4),
};
export const departureSettings = z.object(departureSettingsFields);
export type DepartureSettingsView = z.infer<typeof departureSettings>;
export const saveDepartureSettingsInput = z.strictObject(departureSettingsFields);
export type SaveDepartureSettingsInput = z.infer<typeof saveDepartureSettingsInput>;

/** A departure's money: its bookings' price before GST, what the bookings and the departure itself cost, and what is left. */
export const departureMoney = z.object({
  revenuePaise: z.int(),
  bookingCostPaise: z.int(),
  departureCostPaise: z.int(),
  profitPaise: z.int(),
  marginBasisPoints: z.int().nullable(),
  costs: z.array(
    z.object({
      id: recordId,
      category: z.string(),
      supplier: z.string(),
      supplierId: recordId.nullable(),
      amountPaise: z.int(),
      dueOn: calendarDate.nullable(),
      paidOn: calendarDate.nullable(),
      note: z.string(),
    }),
  ),
});
export type DepartureMoney = z.infer<typeof departureMoney>;

/** The events departures publish (ids only, never personal data). */
export const holdExpiredEvent = z.strictObject({ holdId: recordId, departureId: recordId });
export const seatsFreedEvent = z.strictObject({ departureId: recordId });
export const overbookedEvent = z.strictObject({ departureId: recordId, bookingId: recordId });
