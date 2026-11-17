// The lite turn's act step, in the caller's one transaction: the chat locked, the turn checked as still the one to
// answer (no person replied or took the chat over, the switches still on, no newer line, a follow-up's silence still
// unbroken, no pause), then the booking or the payment details, the messages and the lead, the take-over and switches
// read again, the chat, and last the pause. Any DomainError rolls all of it back, so a stale or paused turn, or a
// booking that can no longer be taken, sends nothing and keeps nothing.
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import { lockChat } from "../../inbox/index.js";
import { assertNewest, assertNotPaused, assertStillAnswering, stoppedSince } from "./act-gates.js";
import { settleChat } from "./act-chat.js";
import { writeOnLead } from "./act-lead.js";
import { moneyMove } from "./act-money.js";
import { actWrites, handOverInstead } from "./act-reply.js";
import { sendMove } from "./act-send.js";
import { suggestFromTurn } from "./suggestions.js";
import type { LiteActDeps, LiteActInput, LiteActResult } from "./act-types.js";

export type { LiteActDeps, LiteActInput, LiteActResult };

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
  // Before anything is held or sent: a paused turn copies no file into storage, which no rollback takes back.
  await assertNotPaused(tx, input);
  // A move that needed words and came with none goes to a person rather than out silent.
  const wordless = !actWrites.has(input.decision.move.kind) && (input.reply?.text.trim() ?? "") === "";
  const decision = wordless ? handOverInstead(input.decision, "unanswered", "act:no_words") : input.decision;
  const acting = { ...input, decision };
  const lead = await openLeadOfChat(tx, chat.personId);
  // A lead the team closed while the follow-up was written: a person decided, and nothing is written yet.
  if (input.kind === "nudge" && lead === null) return { stopped: "no_open_lead" };
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
  await assertStillAnswering(tx, input);
  await settleChat(tx, acting, chat, {
    fileIds: sent.fileIds,
    bookingId,
    sent: sent.sentIds.length > 0,
    leadId: lead?.id ?? null,
  });
  // Read again as the last step before the transaction commits: a pause that landed while act worked (seconds against a
  // distant database) must still stop all of it, so it throws and everything above rolls back.
  await assertNotPaused(tx, input);
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
