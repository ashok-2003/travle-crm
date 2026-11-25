// The shapes the natural agent's parts share: the chat as it reads to the model, the lead, a trip, a quote, staged actions.
import type { LiveOffer, BookingTerms, NaturalTaskKind, OneHandOverReason } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { CalendarDate } from "../../kernel/index.js";

export interface NaturalChatLine {
  id: string;
  from: "customer" | "you" | "team" | "earlier" | "automatic";
  at: Date;
  kind: string;
  text: string;
  fileName?: string;
  teamName?: string;
  // A past action's words, which the chat writes in brackets: "sent: Snow Lake Trek brochure".
  action?: string;
  untranscribed?: boolean;
  mayBePayment?: boolean;
  // What was heard or seen, kept on the message; only the one agent reads it.
  aiText?: { kind: "transcript" | "description"; text: string };
  // The one agent's name for a customer's voice note or photo ("m3"); natural sets none.
  ref?: string;
}

/** A room price per person, in paise, for each room type that has one. */
export type PerPersonPrices = Partial<Record<RoomType, number>>;

/** A sellable group trip as the model reads it (spec 4.2): owner text without payment details or contacts, every number kept. */
export interface TripSheet {
  label: string;
  packageId: string;
  title: string;
  place: string | null;
  /** The place's id, which a person's place on the lead is told apart by. */
  destinationId: string | null;
  nights: number | null;
  startCity: string;
  summary: string;
  highlights: string[];
  days: { title: string; text: string }[];
  pickups: string[];
  inclusions: string;
  exclusions: string;
  notes: string;
  cancellation: string;
  // Priced types only (F14).
  rooms: RoomType[];
  // Not yet ended.
  seasons: { name: string; from: CalendarDate; until: CalendarDate; perPersonPaise: PerPersonPrices }[];
  pricesIncludeGst: boolean;
  taxRateBasisPoints: number;
  fromPaise: number | null;
  advancePerPersonPaise: number | null;
  // The next 8 open, from tomorrow, each with the prices the quote uses on its date (`priceOn`): the season's, the
  // departure's own laid over the season's room by room, or none (empty).
  departures: {
    id: string;
    startsOn: CalendarDate;
    freeSeats: number;
    priceFrom: "season" | "departure" | "none";
    // The rooms the departure prices itself (the others keep the season's); only with priceFrom "departure".
    ownRooms?: RoomType[];
    perPersonPaise: PerPersonPrices;
  }[];
  // Brochures first, then photos.
  fileIds: string[];
  // The same files with the owner's words, for the one agent; natural reads only fileIds.
  brochures: { attachmentId: string; name: string | null; description: string | null }[];
  photoIds: string[];
}

export interface NaturalLeadView {
  name: string;
  cameFrom: string;
  packageId: string | null;
  day: CalendarDate | null;
  month: string | null;
  adults: number | null;
  childrenAges: number[];
  pickupCity: string | null;
  room: RoomType | null;
  stage: string;
  summary: string | null;
  teamNotes: { at: Date; by: string; text: string }[];
  openTasks: string[];
}

/** What the read tools work from: the turn's transaction, its trip sheets and labels (label to package id), its day. */
export interface ReadContext {
  tx: OrgTx;
  sheets: readonly TripSheet[];
  labels: ReadonlyMap<string, string>;
  today: CalendarDate;
  now: Date;
}

export interface QuoteFigures {
  terms: BookingTerms;
  departureId: string;
  perPersonPaise: number;
  totalPaise: number;
  advancePaise: number;
  advancePerPersonPaise: number;
  freeSeats: number;
}

export type StagedAction =
  | {
      tool: "update_lead";
      fields: Partial<{
        packageId: string;
        day: CalendarDate;
        month: string;
        adults: number;
        childrenAges: number[];
        pickupCity: string;
        room: RoomType;
        name: string;
      }>;
      notes: string[];
    }
  | {
      tool: "send_brochure";
      packageId: string;
      fileIds: string[];
      // Both absent for natural: the one agent's brochure name, and the files it sends again though this chat had them.
      caption?: string;
      resend?: readonly string[];
    }
  // The quote behind the offer: its figures are this turn's to ground (G1) and to name the trip by (G6).
  | { tool: "offer_booking"; offer: LiveOffer; figures: QuoteFigures; card?: true }
  | {
      tool: "book";
      terms: BookingTerms;
      figures: QuoteFigures;
      // Null on the one agent: the booking takes the lead's or WhatsApp's name, and no words are copied.
      fullName: string | null;
      customerWords: string | null;
      via: "offer" | "told";
    }
  | { tool: "resend_payment" }
  | { tool: "plan_follow_up"; at: Date | null; about: string }
  | { tool: "create_task"; kind: NaturalTaskKind; text: string; callAt: Date | null }
  | { tool: "add_note"; text: string }
  | { tool: "hand_over"; reason: OneHandOverReason; summary: string }
  | { tool: "suggest_close"; kind: "lost" | "not_a_lead"; reason: string }
  | { tool: "stay_quiet"; reason: string };

// A later call of one tool replaces the earlier.
export type StagedSet = ReadonlyMap<StagedAction["tool"], StagedAction>;
