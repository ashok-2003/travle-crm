// What the lite turn's act step takes and gives back.
import type { LiteLanguage } from "@travel-crm/contracts/ai";
import type { Files } from "../../files/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import type { TurnKind } from "../may-write.js";
import type { BookingRecipients } from "../booking.js";
import type { Found } from "./phrase-match.js";
import type { CheckedForm, Decision, Situation } from "./types.js";

export interface LiteActDeps {
  files: Files;
  /** Who hears about a booking besides the lead's owner. */
  recipients: BookingRecipients;
  /** The plan's storage limit, looked up before the transaction opened (null: none), for the files copied in it. */
  storageLimitBytes: number | null;
  /** The agency's GST state, for the quote. */
  supplierStateCode: string | null;
}

export interface LiteActInput {
  organizationId: string;
  conversationId: string;
  /** The turn's token (a reply's is the customer message it answers): the reply goes out as `ai:<token>`. */
  token: string;
  kind: TurnKind;
  now: Date;
  today: CalendarDate;
  /** The agency's zone, for the hold's end. */
  timeZone: string;
  decision: Decision;
  language: LiteLanguage;
  /** The composed reply; null for book, resend_payment, hand_over and silent, whose fixed texts act writes itself. */
  reply: { text: string; filled: Found[] } | null;
  situation: Situation;
  /** The checked Understand form, when the turn read one: its summary and score are kept. */
  checked: CheckedForm | null;
  model: string | null;
  agencyName: string;
}

export type LiteActResult =
  | "already"
  /** The AI may no longer write here (mayWrite's reason, or "off"): nothing was written. */
  | { stopped: string }
  | {
      leadId: string | null;
      /** Every message sent, in order. */
      sentIds: string[];
      /** The reply's words as sent (a fixed line, the money message, the composed reply); null when none went. */
      text: string | null;
      /** The spans of `text` code wrote. */
      filled: Found[];
      bookingId: string | null;
      handedOver: boolean;
      /** Codes of what changed: "lead:adults", "stage:quote_sent", "booking", "note:quoted"... */
      actions: string[];
    };
