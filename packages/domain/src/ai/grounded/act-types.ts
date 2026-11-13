// What acting on a checked reply takes and gives back (grounded turn, act step).
import type { ChatFacts, WriteAnswer } from "@travel-crm/contracts/ai";
import type { Files } from "../../files/index.js";
import type { TurnKind } from "../may-write.js";
import type { AutopilotRow } from "../autopilot.js";
import type { BookingRecipients } from "../booking.js";
import type { Lookup } from "./lookup-types.js";

export interface ActDeps {
  files: Files;
  /** Who hears about a booking besides the lead's owner. */
  recipients: BookingRecipients;
  /** The plan's storage limit, looked up before the transaction opened (null: none), for the files copied in it. */
  storageLimitBytes: number | null;
  /** The agency's GST state, for the quote. */
  supplierStateCode: string | null;
}

export interface ActInput {
  organizationId: string;
  conversationId: string;
  /** The turn's token: the reply goes out as `ai:<token>`, and a repeat of it changes nothing. */
  token: string;
  /** The reply, placeholders already filled by code and checked. */
  text: string;
  /** Already cut down to what code allows. */
  actions: WriteAnswer["actions"];
  lookup: Lookup;
  facts: ChatFacts;
  now: Date;
  /** A reply, a nudge or a follow-up: a turn that is no reply stamps the nudge, so one silence gets one. */
  kind: TurnKind;
  /** The agency's follow-up settings, for when to write again if the customer goes quiet. */
  settings: Pick<AutopilotRow, "followUpHours" | "smartFollowUp">;
  /** When the model would write again (with the smart follow-up on); null for none. */
  followUp: WriteAnswer["followUp"];
}

export type ActResult =
  | "already"
  | {
      sent: { replyId: string; fileIds: string[]; qr: boolean; pay: boolean };
      /** The AI booking made for this turn, if it requested one. */
      bookingId: string | null;
      flagged: boolean;
      handedOver: boolean;
    };
