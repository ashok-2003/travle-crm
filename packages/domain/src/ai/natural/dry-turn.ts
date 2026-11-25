// The parts of a dry run (Try it; spec 9.5) the one agent's dry turn uses: what a dry turn takes, the lead as the test
// chat keeps it, and the action context that stages and describes actions on the agency's real data, never doing them:
// nothing is sent, held, booked or stored.
import type { DryLead, NaturalTestState } from "@travel-crm/contracts/ai";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { parseCalendarDate } from "../../kernel/index.js";
import type { DryAgency } from "./dry-agency.js";
import type { NaturalPrompt } from "./prompt.js";
import type { ActionContext } from "./tools/action-tools.js";
import { quoteFor, type ReadContext } from "./tools/read-tools.js";
import type { FlagContext } from "./turn-reads.js";
import type { NaturalChatLine, NaturalLeadView } from "./types.js";

export interface NaturalDryTurn {
  /** The whole chat, oldest first. */
  lines: readonly NaturalChatLine[];
  /** What the last turn handed back; null starts a new chat. */
  state: NaturalTestState | null;
  now: Date;
  prompt: NaturalPrompt;
  /** Try it's own model and temperature, on every call; unset, the live agent's. */
  choice: { model?: string; temperature?: number };
}

export interface NaturalDryDependencies {
  db: Database;
  ai: AiModel;
  agencyName: (organizationId: string) => Promise<string>;
  /** Epoch milliseconds, for the turn's time limits (Date.now unless a test sets it). */
  clock?: () => number;
}

export type { FlagContext };

const DRY_CHAT = "dry-run";

export const EMPTY_DRY_LEAD: DryLead = {
  packageId: null,
  day: null,
  month: null,
  adults: null,
  childrenAges: [],
  pickupCity: null,
  room: null,
  name: null,
  stage: "new",
  notes: [],
  tasks: [],
  booking: null,
};

/** The dry lead as the turn block reads it: nobody's notes, and the AI's tasks as the open ones. */
export function dryLeadView(lead: DryLead): NaturalLeadView {
  return {
    name: lead.name ?? "",
    cameFrom: "",
    packageId: lead.packageId,
    day: lead.day === null ? null : parseCalendarDate(lead.day),
    month: lead.month,
    adults: lead.adults,
    childrenAges: lead.childrenAges,
    pickupCity: lead.pickupCity,
    room: lead.room,
    stage: lead.stage,
    summary: null,
    teamNotes: [],
    openTasks: lead.tasks.map((task) => task.text),
  };
}

/** What an action's staging and checks read in a dry turn: Try it's lead and the chat as it was written. */
export function dryActionContext(input: {
  db: Database;
  organizationId: string;
  agency: DryAgency;
  state: NaturalTestState;
  labels: ReadonlyMap<string, string>;
  newLines: readonly NaturalChatLine[];
  lines: readonly NaturalChatLine[];
  now: Date;
  readContext: (tx: OrgTx) => ReadContext;
}): Omit<ActionContext, "quotedThisTurn"> {
  const { db, organizationId, agency, state, lines, now } = input;
  const { sheets, today, timeZone } = agency;
  return {
    sheets,
    labels: input.labels,
    today,
    now,
    timeZone,
    facts: state.facts,
    lead: dryLeadView(state.lead),
    lines,
    newLines: input.newLines,
    paymentReady: agency.paymentLines !== null,
    // The seats an earlier turn would have held await their advance, as the chat's own AI booking.
    booking: state.lead.booking === null ? null : { id: DRY_CHAT, awaitingPayment: true },
    profileName: null,
    quoteOf: (terms) => db.forOrg(organizationId, (tx) => quoteFor(input.readContext(tx), terms)),
    conversationId: DRY_CHAT,
    // Try it's lead has no value a person set.
    typed: {},
    lastInboundAt: lines.findLast((line) => line.from === "customer")?.at ?? now,
    adPackageId: null,
  };
}
