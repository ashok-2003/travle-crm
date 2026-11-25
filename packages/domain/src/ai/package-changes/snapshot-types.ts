// The shapes of a trip as the AI change assistant reads it: its fields, seasons and departures as read, and with the
// refs (S1, D1, N1) and text the model is given.
import type { DepartureStatus } from "@travel-crm/contracts/departures";
import type {
  PackageKind,
  PackageSeasonView,
  QuoteDay,
  RoomPrices,
  RoomType,
  SeasonColumn,
} from "@travel-crm/contracts/quotes";
import type { CalendarDate } from "../../kernel/index.js";

export interface SnapshotTrip {
  id: string;
  name: string;
  kind: PackageKind;
  nights: number | null;
  roomTypes: RoomType[];
  seatsPerDeparture: number | null;
  advancePerPersonPaise: number | null;
  weeklyDays: number[];
  departureMonths: number[];
  pickupPoints: string;
  startCity: string;
  inclusions: string;
  exclusions: string;
  cancellationNotes: string;
  notes: string;
  days: QuoteDay[];
  aiSellable: boolean;
}

export interface SnapshotDeparture {
  id: string;
  startDate: string;
  status: DepartureStatus;
  seatsTotal: number;
  seatsSold: number;
  seatsHeld: number;
  /** What applies on its first day, its own or its season's. */
  prices: RoomPrices;
  ownPrices: RoomPrices;
  /** The day the trip's schedule made it for; null for one staff (or an AI change) added. */
  scheduledOn: string | null;
}

export interface SnapshotInput {
  /** The first day of the departures read: the day the run was proposed, so a later look reads the same window. */
  from: CalendarDate;
  trip: SnapshotTrip;
  seasons: PackageSeasonView[];
  departures: SnapshotDeparture[];
}

export interface TripSnapshot extends SnapshotInput {
  columns: (SeasonColumn & { ref: string })[];
  departures: (SnapshotDeparture & { ref: string })[];
  notes: { ref: string; line: string }[];
  /** The trip as the model reads it. */
  text: string;
}
