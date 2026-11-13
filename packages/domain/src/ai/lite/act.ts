// The lite turn's act step, in the caller's one transaction: the chat locked, the turn checked as still the one to
// answer (no person replied or took the chat over, the switches still on, no newer line), then the booking or the
// payment details, the messages, the lead and the chat, and last the pause read again. Any DomainError rolls all of it
// back, so a stale or paused turn, or a booking that can no longer be taken, sends nothing and keeps nothing.
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import { lockChat } from "../../inbox/index.js";
import { DomainError } from "../../kernel/index.js";
import { agentPauseOf } from "../../subscriptions/index.js";
import type { ChatFacts } from "../agent-effects.js";
import { autopilotOf } from "../autopilot.js";
import { mayWrite } from "../may-write.js";
import { aiEnabled } from "../settings.js";
import { settleChat } from "./act-chat.js";
import { writeOnLead } from "./act-lead.js";
import { moneyMove } from "./act-money.js";
import { actWrites, handOverInstead } from "./act-reply.js";
import { sendMove } from "./act-send.js";
import { suggestFromTurn } from "./suggestions.js";
import type { LiteActDeps, LiteActInput, LiteActResult } from "./act-types.js";

export type { LiteActDeps, LiteActInput, LiteActResult };

/** For a reply, whether a newer customer line came: its own turn answers it, and this one writes nothing. */
async function assertNewest(tx: OrgTx, input: LiteActInput): Promise<void> {
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

/**
 * Why the AI may no longer write in this chat, read again under the chat's lock: since the turn's first checks a person
 * may have replied or taken the chat over, or the owner switched the agent off. Null while it still may.
 */
async function stoppedSince(tx: OrgTx, input: LiteActInput, chat: ChatFacts): Promise<string | null> {
  const settings = await autopilotOf(tx);
  if (!settings.autopilot || !settings.lite || !(await aiEnabled(tx))) return "off";
  return mayWrite(tx, chat, settings, input.kind, input.now);
}

export async function actOnMove(tx: OrgTx, deps: LiteActDeps, input: LiteActInput): Promise<LiteActResult> {
  // The chat's row first, held to the end. The inbound path locks the chat and then the lead, so every lead lock below
  // (the booking, the fields, the stage) must come after it, never before: else a customer's line and this turn could
  // each wait on the other. Held, it also keeps a new line out until this turn ends, so the checks below see them all.
  await lockChat(tx, input.conversationId);
  const earlier = await tx.whatsappMessage.findFirst({
    where: { clientToken: `ai:${input.token}` },
    select: { id: true },
  });
  if (earlier !== null) return "already";
  const chat = await tx.whatsappConversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    select: {
      id: true,
      personId: true,
      phoneE164: true,
      profileName: true,
      lastInboundAt: true,
      state: true,
      hidden: true,
    },
  });
  // Nothing is written yet: ending here keeps nothing and tells nobody, as a turn that never began.
  const stopped = await stoppedSince(tx, input, chat);
  if (stopped !== null) return { stopped };
  await assertNewest(tx, input);
  // A move that needed words and came with none goes to a person rather than out silent.
  const wordless = !actWrites.has(input.decision.move.kind) && (input.reply?.text.trim() ?? "") === "";
  const decision = wordless ? handOverInstead(input.decision, "unanswered", "act:no_words") : input.decision;
  const acting = { ...input, decision };
  const lead = await openLeadOfChat(tx, chat.personId);
  const money = await moneyMove(tx, deps, acting, lead?.id ?? null);
  const sent = await sendMove(tx, deps, acting, money);
  const bookingId = money?.bookingId ?? null;
  const actions = [...(bookingId === null ? [] : ["booking"]), ...sent.codes];
  if (lead !== null) actions.push(...(await writeOnLead(tx, acting, lead, chat)));
  if (lead !== null)
    await suggestFromTurn(tx, {
      organizationId: input.organizationId,
      leadId: lead.id,
      conversationId: chat.id,
      decision,
      checked: input.checked,
      now: input.now,
    });
  await settleChat(tx, acting, chat, { fileIds: sent.fileIds, bookingId, sent: sent.sentIds.length > 0 });
  // Read again as the last step before the transaction commits: a pause that landed while act worked (seconds against a
  // distant database) must still stop all of it, so it throws and everything above rolls back.
  if ((await agentPauseOf(tx, input.organizationId)) !== null) {
    throw new DomainError("CONFLICT", "AGENT_PAUSED", "The AI agent is paused by platform staff");
  }
  const { move } = decision;
  if (move.kind === "hand_over") actions.push(`handover:${move.reason}`);
  return {
    leadId: lead?.id ?? null,
    sentIds: sent.sentIds,
    text: sent.text,
    filled: sent.filled,
    bookingId,
    handedOver: move.kind === "hand_over",
    actions,
  };
}
