// The gates a turn passes before it reads anything for the model, re-read each turn and in this order: the AI module and
// the owner's switch, the chat's own checks, a customer judged Not a lead, the agent's setup, then the month's limit.
// Lite's prepare and the natural agent's share them; what passes comes back for the reads that follow.
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn, type CalendarDate } from "../../kernel/index.js";
import { sellablePackages } from "../../quotes/index.js";
import type { ChatRow } from "../may-write.js";
import { agentSetupOf } from "../agent-setup.js";
import { autopilotOf, type AutopilotRow } from "../autopilot.js";
import { mayWrite } from "../may-write.js";
import { aiEnabled } from "../settings.js";
import { MONTHLY_AI_LIMIT, usedThisMonth } from "../usage.js";
import { markedNotALead } from "./open-lead.js";
import type { LiteOutcome, LiteTurnInput } from "./types.js";

/** What a turn that passed its gates has read. */
export interface TurnGatesPassed {
  settings: AutopilotRow;
  /** The chat's row, with the customer's number and WhatsApp name. */
  chat: ChatRow & { phoneE164: string; profileName: string | null };
  timeZone: string;
  today: CalendarDate;
  /** The packages the agent may sell today: the setup's check read them, and the turn's index takes them. */
  sellable: { id: string; kind: string }[];
}

/**
 * Either why the turn ends now (the outcome), or what passed. `limits: false` leaves the day's cap and the month's limit
 * to the caller, which reads them itself: the natural agent hands the chat over at either instead of ending the turn
 * (plan 2, ruling 5).
 */
export async function turnGates(
  tx: OrgTx,
  input: LiteTurnInput,
  now: Date,
  options: { limits?: boolean } = {},
): Promise<TurnGatesPassed | LiteOutcome> {
  const limits = options.limits !== false;
  const settings = await autopilotOf(tx);
  // The inbox hands an agency's chats on with the AI module off too (automationCouldAct): the turn refuses them.
  if (!(await aiEnabled(tx)) || !settings.autopilot) return "off";
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      personId: true,
      lastInboundAt: true,
      state: true,
      hidden: true,
      phoneE164: true,
      profileName: true,
    },
  });
  if (chat === null) return "nothing";
  const row: ChatRow = {
    id: chat.id,
    personId: chat.personId,
    lastInboundAt: chat.lastInboundAt,
    state: chat.state,
    hidden: chat.hidden,
  };
  const blocked = await mayWrite(tx, row, settings, input.kind, now, { dayCap: limits });
  if (blocked !== null) return blocked;
  // A person judged the customer Not a lead: nothing is read for them, nothing sent, nobody told.
  if (await markedNotALead(tx, chat.personId)) return "not_a_lead";
  const timeZone = await organizationTimeZone(tx, input.organizationId);
  const today = calendarDateIn(now, timeZone);
  // Read once for the turn: the setup's check and the index both take this list.
  const sellable = await sellablePackages(tx, input.organizationId, today);
  if (!(await agentSetupOf(tx, input.organizationId, today, sellable)).ready) return "not_ready";
  // Each model call reserves its own call later; here only a month already full ends the turn.
  if (limits && (await usedThisMonth(tx, now, timeZone)) >= MONTHLY_AI_LIMIT) return "limit";
  return { settings, chat, timeZone, today, sellable };
}
