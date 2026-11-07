// What the grounded turn's lookup hands on: the packages a chat's facts point at, with the facts code read about each.
import type { RoomPrices, RoomType } from "@travel-crm/contracts/quotes";
import type { OpenDeparture } from "../../departures/index.js";
import type { CalendarDate } from "../../kernel/index.js";

/** Why a package is in the lookup. */
export type PackageWhy = { kind: "chosen" } | { kind: "place"; words: string } | { kind: "nearest"; words: string[] };

export interface LookupPackage {
  id: string;
  why: PackageWhy;
  name: string;
  title: string;
  kind: "custom" | "group";
  destination: string | null;
  nights: number | null;
  summary: string;
  highlights: string[];
  inclusions: string;
  exclusions: string;
  dayTitles: string[];
  startCity: string;
  pickupPoints: string;
  pricesIncludeGst: boolean;
  offered: RoomType[];
  /** Per person by room type on the asked date; null when no date is asked or the date has no open departure or season. */
  prices: RoomPrices | null;
  /** The lowest coming price per room type (a group package only). */
  from: RoomPrices;
  /** The lowest per-person price: for a group package an adult's, for a custom one the figure staff entered. */
  fromPaise: number | null;
  /** The next open departures, at most three (none for a custom package). */
  departures: OpenDeparture[];
  /** The open departure on the asked date, or the one the chat settled on. */
  chosenDeparture: OpenDeparture | null;
  /**
   * What the chat's rooms (`roomsFor`: in a package selling one room type, every traveller in it) add up to on the asked
   * date, only when every traveller has a priced room.
   */
  total: number | null;
  advancePerPersonPaise: number | null;
  hasPaymentQr: boolean;
  hasPaymentText: boolean;
  /** Brochures the chat has not been sent yet. */
  brochures: { id: string; fileName: string }[];
}

export interface Lookup {
  packages: LookupPackage[];
  notRun: string[];
  customTrips: boolean;
  today: CalendarDate;
  travellers: number | null;
  startsOn: CalendarDate | null;
}
