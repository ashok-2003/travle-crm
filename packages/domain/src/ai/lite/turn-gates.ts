// The gates a turn passes before it reads anything for the model, re-read each turn and in this order: the AI module and
// the owner's switch, the chat's own checks, a customer judged Not a lead, the agent's setup, then the month's limit.
// Lite's prepare and the natural agent's share them; what passes comes back for the reads that follow.
import type { OrgTx } from "@travel-crm/db";
import { organizationTimeZone } from "../../identity/index.js";
import { calendarDateIn, type CalendarDate } from "../../kernel/index.js";
import { sellablePackages } from "../../quotes/index.js";
import { agentSetupOf } from "../agent-setup.js";
import { autopilotOf, type AutopilotRow } from "../autopilot.js";
import { chatRowOf, mayWrite, repliesToday, type ChatRow } from "../may-write.js";
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

/** The day's cap and the month's limit as data, for a caller that hands the chat over at them. */
export interface TurnLimits {
  /** The replies the chat has had today, counted as the day's cap counts them (`repliesToday`). */
  repliesToday: number;
  /** The agency's cap on a chat's replies a day. */
  dayCap: number;
  /** The month's AI calls are all used. */
  monthFull: boolean;
}

/**
 * Either why the turn ends now (the outcome), or what passed. Lite's turn ends at the day's cap and the month's limit;
 * `limits: false` hands both back instead, for the natural agent to hand the chat over at either (plan 2, ruling 5).
 */
export function turnGates(tx: OrgTx, input: LiteTurnInput, now: Date): Promise<TurnGatesPassed | LiteOutcome>;
export function turnGates(
  tx: OrgTx,
  input: LiteTurnInput,
  now: Date,
  options: { limits: false },
): Promise<(TurnGatesPassed & { limits: TurnLimits }) | LiteOutcome>;
export async function turnGates(
  tx: OrgTx,
  input: LiteTurnInput,
  now: Date,
  options?: { limits: false },
): Promise<TurnGatesPassed | (TurnGatesPassed & { limits: TurnLimits }) | LiteOutcome> {
  const ending = options === undefined;
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
  const blocked = await mayWrite(tx, chatRowOf(chat), settings, input.kind, now, { dayCap: ending });
  if (blocked !== null) return blocked;
  // A person judged the customer Not a lead: nothing is read for them, nothing sent, nobody told.
  if (await markedNotALead(tx, chat.personId)) return "not_a_lead";
  const timeZone = await organizationTimeZone(tx, input.organizationId);
  const today = calendarDateIn(now, timeZone);
  // Read once for the turn: the setup's check and the index both take this list.
  const sellable = await sellablePackages(tx, input.organizationId, today);
  if (!(await agentSetupOf(tx, input.organizationId, today, sellable)).ready) return "not_ready";
  const passed = { settings, chat, timeZone, today, sellable };
  // Each model call reserves its own call later; here only a month already full ends the turn.
  const monthFull = (await usedThisMonth(tx, now, timeZone)) >= MONTHLY_AI_LIMIT;
  if (ending) return monthFull ? "limit" : passed;
  const state = await tx.aiChat.findFirst({
    where: { conversationId: chat.id },
    select: { repliesOn: true, repliesCount: true },
  });
  return {
    ...passed,
    limits: { repliesToday: repliesToday(state, now), dayCap: settings.maxRepliesPerDay, monthFull },
  };
}
