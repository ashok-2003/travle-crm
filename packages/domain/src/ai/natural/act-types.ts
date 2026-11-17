// What the natural turn's act step takes and gives back (plan 2, Task 5): the turn's words and staged actions, what the
// prepare step read, and the outcome the live turn goes on from; and how its steps read one staged action.
import type { NaturalFacts, NaturalTaskKind } from "@travel-crm/contracts/ai";
import type { CalendarDate, WorkingHours } from "../../kernel/index.js";
import type { ActGateInput } from "../lite/act-gates.js";
import type { LiteActDeps } from "../lite/act-types.js";
import type { TypedFields } from "../lite/typed-lock.js";
import type { QuoteFigures, StagedAction, StagedSet, TripSheet } from "./types.js";

export type StagedOf<T extends StagedAction["tool"]> = Extract<StagedAction, { tool: T }>;

const isOf = <T extends StagedAction["tool"]>(action: StagedAction, tool: T): action is StagedOf<T> =>
  action.tool === tool;

/** The turn's staged call of `tool`, or null when it made none (the dry turn's answer reads them so too). */
export function stagedOf<T extends StagedAction["tool"]>(set: StagedSet, tool: T): StagedOf<T> | null {
  for (const action of set.values()) if (isOf(action, tool)) return action;
  return null;
}

export interface NaturalActInput extends ActGateInput {
  today: CalendarDate;
  /** The words, at most two WhatsApp messages; none for a quiet turn. */
  messages: string[];
  staged: StagedSet;
  /** This turn's quotes, and its offer's and booking's figures: a total the words state is told (`facts.told`). */
  quoted: QuoteFigures[];
  /** The chat's facts as the turn read them. */
  facts: NaturalFacts;
  sheets: readonly TripSheet[];
  /** The lead's values a person set, as the turn read them. */
  typed: TypedFields;
  /** The model's hand-over, or code's (day_cap, month_limit, payment_check); a staged one counts when this is null. */
  handOver: { reason: string; summary: string } | null;
  /** The fallback's task for the team. */
  task: { kind: NaturalTaskKind; text: string } | null;
  traceId: string;
  model: string | null;
  agencyName: string;
}

export interface NaturalActDeps extends LiteActDeps {
  /** Who gets a task on a lead nobody owns: the first member (by name) holding leads:assign, read before the act. */
  taskOwner: string | null;
  /** The agency's working hours: a task is due 2 working hours on. */
  workingHours: WorkingHours;
}

export type NaturalActResult =
  /** The turn's `ai:<token>` went already: nothing more is sent. */
  | "already"
  /** The AI may no longer write here (mayWrite's reason, "off", "night", "answered"): nothing was written. */
  | { stopped: string }
  /** The booking or the payment details again were refused (a DomainError's reason): it rolled back, nothing went. */
  | { refused: string; message: string }
  | {
      leadId: string | null;
      /** Every message sent, in order. */
      sentIds: string[];
      bookingId: string | null;
      handedOver: boolean;
      /** Codes of what changed: "booking", "pay", "files:1", "lead:adults", "task:question", "stage:contacted"... */
      actions: string[];
      /** The chat's facts as the next turn reads them. */
      facts: NaturalFacts;
    };
