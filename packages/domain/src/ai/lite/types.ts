// The lite turn's shared types, declarations only: what it takes, decides, reads, traces and gives back.
import type { Database } from "@travel-crm/db";
import type {
  AgencyQuestionTopic,
  ChecklistItem,
  LiteFacts,
  LiteIntent,
  LookupTool,
  UnderstandForm,
} from "@travel-crm/contracts/ai";
import type { AiFilledField, LeadStage, LostReason } from "@travel-crm/contracts/crm";
import type { RoomBooking, RoomType } from "@travel-crm/contracts/quotes";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { Files } from "../../files/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import type { SubscriptionAccess } from "../../subscriptions/index.js";
import type { TurnKind } from "../agent-prompt.js";
import type { BookingRecipients } from "../booking.js";

export interface LiteDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
  files: Files;
  managers: BookingRecipients;
  subscriptions?: Pick<SubscriptionAccess, "entitlementsOf">;
  logger?: Logger;
  traces?: TraceSink;
}

export interface LiteTurnInput {
  organizationId: string;
  conversationId: string;
  kind: TurnKind;
  token: string;
  followUp?: string;
}

/** replied, handed_off, silent, answered, superseded, blocked, unfit, not_ready, nothing, plus mayWrite's and the model's. */
export type LiteOutcome = string;

export type SaleStage =
  "exploring" | "package_picked" | "details_complete" | "quoted" | "waiting_for_payment" | "payment_to_check";

export type HandOverReason =
  | "discount"
  | "custom_trip"
  | "big_group"
  | "complaint"
  | "wants_person"
  | "wants_call"
  | "payment_problem"
  | "has_booking"
  | "image"
  | "voice_note"
  | "unanswered"
  | "loop"
  | "other_twice"
  | "check_failed";

export type FixedTextKey =
  | "price_from"
  | "price_full"
  | "seats_left"
  | "book_payment"
  | "book_payment_full"
  | "payment_again"
  | "payment_heading"
  | "screenshot_received"
  | "ask_screenshot"
  | "hand_over"
  | "voice_note"
  | "identity"
  | "not_run"
  | "close"
  | "later"
  | "how_can_i_help";

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
  | { kind: "silent" };

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

export type PromptPieceName =
  | "understand.instructions"
  | "understand.intents"
  | "understand.form"
  | "write.instructions"
  | "write.voice"
  | "write.moves"
  | "fixed.texts";

export interface LiteTrace {
  id: string;
  organizationId: string;
  conversationId: string;
  leadId: string | null;
  kind: TurnKind;
  startedAt: Date;
  durationMs: number;
  outcome: LiteOutcome;
  reason: string | null;
  move: Move["kind"] | null;
  stage: SaleStage | null;
  why: string | null;
  intents: LiteIntent[];
  promptVersions: Record<PromptPieceName, number>;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  /** The context's messages, referenced, never copied. */
  messageIds: string[];
  /** Every block but "Messages". */
  understand: { blocks: Record<string, string>; raw: string | null } | null;
  lookups: { request: LookupRequest; result: LookupResult }[];
  checks: { name: string; passed: boolean; detail: string | null }[];
  write: { blocks: Record<string, string>; raw: string[] } | null;
  sent: { messageIds: string[]; text: string | null };
  /** Codes: "lead:adults", "stage:quote_sent", "booking"... */
  actions: string[];
}

export interface TraceSink {
  record(trace: LiteTrace): Promise<void>;
}
