// What an act step takes and gives back, in the lite shape the one agent's act gates still read.
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
