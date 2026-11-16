// The checks an agent's act runs in its one transaction, under the chat's lock, so a turn that is no longer the one to
// answer sends nothing and keeps nothing: no person replied or took the chat over, the switches are still on, no newer
// customer line came, a follow-up's silence is unbroken, and platform staff have not paused the agent. Lite's act and
// the natural agent's share them.
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../../kernel/index.js";
import { agentPauseOf } from "../../subscriptions/index.js";
import type { ChatRow } from "../may-write.js";
import { autopilotOf, type AutopilotRow } from "../autopilot.js";
import { agentAnswers, mayWrite } from "../may-write.js";
import { aiEnabled } from "../settings.js";
import type { LiteActInput } from "./act-types.js";
import { inWakingHours, stillQuiet } from "./follow-ups.js";

/** What the gates read of a turn. */
export type ActGateInput = Pick<
  LiteActInput,
  "organizationId" | "conversationId" | "token" | "kind" | "now" | "timeZone"
>;

/** For a reply, whether a newer customer line came: its own turn answers it, and this one writes nothing. */
export async function assertNewest(tx: OrgTx, input: ActGateInput): Promise<void> {
  if (input.kind !== "reply") return;
  // The newest line as the reply job reads it before the turn: one that came while the model wrote has its own turn.
  const newest = await tx.whatsappMessage.findFirst({
    where: { conversationId: input.conversationId, direction: "in" },
    orderBy: { occurredAt: "desc" },
    select: { id: true },
  });
  if (newest?.id !== input.token) {
    throw new DomainError("CONFLICT", "NEWER_MESSAGE", "The customer wrote again since the turn began");
  }
}

/** The agency's settings while the agent is on (the owner's switch and the AI module); else null. */
async function agentOn(tx: OrgTx): Promise<AutopilotRow | null> {
  const settings = await autopilotOf(tx);
  return settings.autopilot && (await aiEnabled(tx)) ? settings : null;
}

/**
 * Why the AI may no longer write in this chat, read again under the chat's lock: since the turn's first checks a person
 * may have replied or taken the chat over, or the owner switched the agent off; a follow-up goes only in the agency's
 * waking hours, and not once the customer, a person or other automation has written since our last message
 * (`reactions`: a reaction on ours counts too, as `stillQuiet` reads it). `dayCap: false` leaves the day's count to
 * the caller, as `mayWrite` does. Null while it still may.
 */
export async function stoppedSince(
  tx: OrgTx,
  input: ActGateInput,
  chat: ChatRow,
  options: { reactions?: boolean; dayCap?: boolean } = {},
): Promise<string | null> {
  const settings = await agentOn(tx);
  if (settings === null) return "off";
  const blocked = await mayWrite(tx, chat, settings, input.kind, input.now, options);
  if (blocked !== null || input.kind !== "nudge") return blocked;
  if (!inWakingHours(input.now, input.timeZone)) return "night";
  return (await stillQuiet(tx, chat.id, options)) ? null : "answered";
}

/**
 * Read again before the chat is settled: a take-over or a switch turned off takes no chat lock, so one committed while
 * act worked (seconds against a distant database) is only seen here, and refuses all of it.
 */
export async function assertStillAnswering(tx: OrgTx, input: ActGateInput): Promise<void> {
  const settings = await agentOn(tx);
  const state =
    settings === null
      ? null
      : await tx.aiChat.findFirst({
          where: { conversationId: input.conversationId },
          select: { mode: true, handedOffAt: true },
        });
  if (settings === null || !agentAnswers(state?.mode, settings.autopilot) || state?.handedOffAt != null) {
    throw new DomainError("CONFLICT", "AGENT_STOPPED", "A person took the chat over or the AI was switched off");
  }
}

/** Platform staff paused the agent: nothing of this turn may go. */
export async function assertNotPaused(tx: OrgTx, input: ActGateInput): Promise<void> {
  if ((await agentPauseOf(tx, input.organizationId)) !== null) {
    throw new DomainError("CONFLICT", "AGENT_PAUSED", "The AI agent is paused by platform staff");
  }
}
