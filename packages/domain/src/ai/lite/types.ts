// The lite turn's shared types, declarations only, kept for the parts the one agent still uses: what a turn takes,
// decides, reads and gives back.
import type { Database } from "@travel-crm/db";
import type {
  AgencyQuestionTopic,
  ChecklistItem,
  HandOverReason,
  LiteFacts,
  LookupTool,
  UnderstandForm,
} from "@travel-crm/contracts/ai";
import type { AiFilledField, LeadStage, LostReason } from "@travel-crm/contracts/crm";
import type { RoomBooking, RoomType } from "@travel-crm/contracts/quotes";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { AiTracing } from "@travel-crm/integrations/tracing";
import type { Files } from "../../files/index.js";
import type { Identity } from "../../identity/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import type { SubscriptionAccess } from "../../subscriptions/index.js";
import type { TurnKind } from "../may-write.js";
import type { BookingRecipients } from "../booking.js";

export interface LiteDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
  files: Files;
  managers: BookingRecipients;
  subscriptions?: Pick<SubscriptionAccess, "entitlementsOf">;
  /**
   * Who owns the agency's leads, for the lead a returning customer's turn opens (without it, a person takes the chat); the
   * team's names and who holds a permission, for the natural agent. Each call runs its own queries: never inside a
   * transaction.
   */
  identity?: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile" | "memberContacts" | "membersHolding">;
  logger?: Logger;
  /** The minute job's clock: a follow-up reads it again before it acts, so its checks hold when it sends. */
  clock?: () => Date;
  /** The traced turn this runs in, told what the customer wrote; without one, nothing is. */
  tracing?: AiTracing;
}

export interface LiteTurnInput {
  organizationId: string;
  conversationId: string;
  kind: TurnKind;
  token: string;
}

/** replied, handed_off, silent, answered, superseded, blocked, unfit, not_ready, nothing, plus mayWrite's and the model's. */
export type LiteOutcome = string;

export type SaleStage =
  "exploring" | "package_picked" | "details_complete" | "quoted" | "waiting_for_payment" | "payment_to_check";

export type { HandOverReason };

export type Move =
  | { kind: "greet"; packageIds: string[] } // [] asks where they'd like to go
  | { kind: "answer_package"; packageId: string; ask: ChecklistItem | null }
  | { kind: "answer_agency"; topic: AgencyQuestionTopic; ask: ChecklistItem | null }
  | { kind: "give_dates"; packageId: string; departureIds: string[]; ask: ChecklistItem | null }
  /** "from" while there is no total (no departure, party or room yet): code then says "from ₹…", never a room's price. */
  | { kind: "give_price"; packageId: string; price: "from" | "full"; ask: ChecklistItem | null }
  | { kind: "ask_detail"; item: ChecklistItem; choices: string[] } // choices only on the loop guard's third ask
  | { kind: "confirm_place"; packageIds: string[] }
  | { kind: "show_other_trips"; packageIds: string[] }
  | { kind: "book"; packageId: string; departureId: string }
  | { kind: "resend_payment" }
  | {
      kind: "fixed";
      text: "screenshot_received" | "ask_screenshot" | "identity" | "not_run" | "close" | "later" | "how_can_i_help";
    }
  | { kind: "hand_over"; reason: HandOverReason }
  | { kind: "silent" }
  /** A nudge turn's: the first picks the chat up again and asks `ask` (or whether they have questions); the second asks nothing. */
  | { kind: "follow_up"; number: 1 | 2; ask: ChecklistItem | null };

export type LeadNoteKey = "package_picked" | "quoted" | "handed_over" | "not_interested" | "later";

export interface Decision {
  move: Move;
  stage: SaleStage;
  why: string;
  facts: LiteFacts;
  stopFollowUps: boolean;
  note: LeadNoteKey | null;
  task: "call_back" | "decide_later" | null;
  stageTo: "contacted" | "quote_sent" | null;
  /** Stored by plan 3b. */
  suggest: { kind: "lost" | "not_a_lead"; lostReason: LostReason | null; reason: string } | null;
}

export interface PackageIndexEntry {
  id: string;
  title: string;
  place: string | null;
  destinationId: string | null;
  nights: number | null;
  startCity: string;
  /** The starting price per person, set by the turn when it builds the index; greet and show_other_trips quote it. */
  fromPaise?: number | null;
}

export interface SituationPackage extends PackageIndexEntry {
  pickups: string[];
  offered: RoomType[];
  adultRooms: RoomType[];
  departures: DepartureLine[];
}

export interface DepartureLine {
  id: string;
  startsOn: CalendarDate;
  freeSeats: number;
}

export interface PackageDetails {
  packageId: string;
  title: string;
  place: string | null;
  nights: number | null;
  startCity: string;
  pickups: string[];
  days: string[];
  highlights: string[];
  inclusions: string;
  exclusions: string;
  notes: string;
  cancellation: string;
}

export interface PriceFacts {
  packageId: string;
  roomType: RoomType | null;
  fromPaise: number | null;
  perPersonPaise: number | null;
  totalPaise: number | null;
  advancePaise: number | null;
  advancePerPersonPaise: number | null;
  rooms: RoomBooking[];
  travellers: number | null;
  departure: DepartureLine | null;
}

export type LookupRequest = UnderstandForm["lookups"][number];

export type LookupResult =
  | { tool: "find_packages"; words: string; exact: PackageIndexEntry[]; closest: PackageIndexEntry[] }
  | { tool: "package_details"; details: PackageDetails }
  | { tool: "dates_and_seats"; packageId: string; month: string | null; departures: DepartureLine[] }
  | { tool: "price"; price: PriceFacts }
  | { tool: "agency_answer"; topic: AgencyQuestionTopic; answer: string | null }
  | { tool: LookupTool; error: "unknown_package" | "bad_month" | "missing_input" };

export interface Situation {
  package: SituationPackage | null;
  price: PriceFacts | null;
  looked: { request: LookupRequest; result: LookupResult }[];
}

export interface ContextMessage {
  id: string;
  from: "customer" | "you" | "team";
  at: Date;
  kind: string;
  text: string;
}

export interface TimelineLine {
  at: Date;
  kind: "note" | "stage";
  text: string;
}

export interface LeadCardFacts {
  name: string | null;
  stage: LeadStage | null;
  packageTitle: string | null;
  place: string | null;
  when: { day: CalendarDate } | { month: string } | null;
  adults: number | null;
  childrenAges: number[];
  pickupCity: string | null;
  roomType: RoomType | null;
}

export interface FieldProof {
  excerpt: string;
  messageIds: string[];
}

export interface CheckedForm {
  form: UnderstandForm;
  proofs: Partial<Record<AiFilledField, FieldProof>>;
  dropped: string[];
}
