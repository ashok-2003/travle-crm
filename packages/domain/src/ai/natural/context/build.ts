// What the one agent's context is built from (spec 4.1): the prompt and the agent's voice, the agency's data, the trips,
// the lead, the chat's facts and lines, and a notice for the turn.
import type { AgencyAnswers, NaturalFacts } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../../kernel/index.js";
import type { AgencyContact } from "../../agency-answers.js";
import type { AgentVoice, NaturalPrompt } from "../prompt.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../types.js";

export interface NaturalContextInput {
  prompt: NaturalPrompt;
  voice: AgentVoice;
  timeZone: string;
  today: CalendarDate;
  now: Date;
  answers: AgencyAnswers;
  /** Where the agency is and its Instagram, for a customer who asks (never its registered name or GSTIN). */
  contact: AgencyContact;
  sheets: readonly TripSheet[];
  lead: NaturalLeadView;
  facts: NaturalFacts;
  /** The whole chat read, oldest first. */
  lines: readonly NaturalChatLine[];
  cameFrom: { source: string; packageId: string | null } | null;
  /** What the app did before the model (ruling 6), else null. */
  notice: string | null;
  /** False for ruling 6's turns: one call with no tools. */
  withTools: boolean;
}
