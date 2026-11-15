// The shapes the natural agent's later parts share: the chat as it reads to the model, the lead, a quote, staged actions.
import type { LiveOffer, BookingTerms, NaturalHandOverReason, NaturalTaskKind } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import type { CalendarDate } from "../../kernel/index.js";

export interface NaturalChatLine {
  id: string;
  from: "customer" | "you" | "team" | "earlier" | "automatic";
  at: Date;
  kind: string;
  text: string;
  fileName?: string;
  teamName?: string;
  // A past action's bracketed words.
  action?: string;
  untranscribed?: boolean;
  mayBePayment?: boolean;
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
  | { tool: "send_brochure"; packageId: string; fileIds: string[] }
  | { tool: "offer_booking"; offer: LiveOffer }
  | {
      tool: "book";
      terms: BookingTerms;
      figures: QuoteFigures;
      fullName: string;
      customerWords: string;
      via: "offer" | "told";
    }
  | { tool: "resend_payment" }
  | { tool: "plan_follow_up"; at: Date | null; about: string }
  | { tool: "create_task"; kind: NaturalTaskKind; text: string; callAt: Date | null }
  | { tool: "add_note"; text: string }
  | { tool: "hand_over"; reason: NaturalHandOverReason; summary: string }
  | { tool: "suggest_close"; kind: "lost" | "not_a_lead"; reason: string }
  | { tool: "stay_quiet"; reason: string };

// A later call of one tool replaces the earlier.
export type StagedSet = ReadonlyMap<StagedAction["tool"], StagedAction>;
