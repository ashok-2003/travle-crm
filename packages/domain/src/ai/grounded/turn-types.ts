// What the grounded turn takes and gives back (kept apart from agent.ts, which hands over to it, so neither imports the other).
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { Logger } from "@travel-crm/integrations/logging";
import type { Files } from "../../files/index.js";
import type { BookingRecipients } from "../booking.js";
import type { TurnKind } from "../agent-prompt.js";

export interface GroundedDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
  files: Files;
  managers: BookingRecipients;
  logger?: Logger;
}

export interface TurnInput {
  organizationId: string;
  conversationId: string;
  kind: TurnKind;
  token: string;
  /** What the follow-up that came due is about, for a `followUp` turn. */
  followUp?: string;
}

/** Today's strings of the old agent (replied, replied_flagged, handed_off, answered, limit...) plus `blocked` and `unfit`. */
export type TurnOutcome = string;
