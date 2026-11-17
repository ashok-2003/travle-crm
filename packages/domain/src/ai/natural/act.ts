// The natural turn's act step (spec 3.2, plan 2 Task 5), in the caller's one transaction and in lite's order: the chat
// locked, the turn checked as still the one to answer (lite's act gates: no person replied or took the chat over, the
// switches still on, no newer line, a follow-up's silence unbroken, no pause), then the booking or the payment details
// again, the messages, the lead, the hand-over, the take-over and switches read again, the chat, and last the pause. A
// gate's DomainError rolls all of it back; a booking's refusal undoes the money step and comes back as `refused`.
import type { OrgTx } from "@travel-crm/db";
import { openLeadOfChat } from "../../crm/index.js";
import { lockChat } from "../../inbox/index.js";
import { assertNewest, assertNotPaused, assertStillAnswering, stoppedSince } from "../lite/act-gates.js";
import { settleNaturalChat, tellOfHandOver } from "./act-chat.js";
import { writeTurnOnLead } from "./act-lead.js";
import { moneyOfTurn } from "./act-money.js";
import { sendTurn } from "./act-send.js";
import { addTurnTasks } from "./act-task.js";
import { stagedOf, type NaturalActDeps, type NaturalActInput, type NaturalActResult } from "./act-types.js";
import { toldIn } from "./dry-answer.js";

export type { NaturalActDeps, NaturalActInput, NaturalActResult };

/** The hand-over the turn makes: code's or the model's, as the input names it, else the model's staged one. */
function handOverOf(input: NaturalActInput): { reason: string; summary: string } | null {
  const staged = stagedOf(input.staged, "hand_over");
  return input.handOver ?? (staged === null ? null : { reason: staged.reason, summary: staged.summary });
}

export async function actOnNaturalTurn(
  tx: OrgTx,
  deps: NaturalActDeps,
  input: NaturalActInput,
): Promise<NaturalActResult> {
  // The chat's row first, held to the end: every lead lock below comes after it, as on the inbound path, and a new line
  // waits until this turn ends, so the checks below see them all.
  await lockChat(tx, input.conversationId);
  const prefix = `ai:${input.token}`;
  const earlier = await tx.whatsappMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      OR: [{ clientToken: prefix }, { clientToken: { startsWith: `${prefix}:` } }],
    },
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
  const handOver = handOverOf(input);
  // The day's cap stops every turn but the hand-over code makes at it (ruling 5); a reaction answers a follow-up (13).
  const stopped = await stoppedSince(tx, input, chat, { reactions: true, dayCap: handOver?.reason !== "day_cap" });
  // Nothing is written yet: ending here keeps nothing and tells nobody, as a turn that never began.
  if (stopped !== null) return { stopped };
  await assertNewest(tx, input);
  // Before anything is held or sent: a paused turn copies no file into storage, which no rollback takes back.
  await assertNotPaused(tx, input);
  const lead = await openLeadOfChat(tx, chat.personId);
  // A lead the team closed while the follow-up was written: a person decided, and nothing is written yet.
  if (input.kind === "nudge" && lead === null) return { stopped: "no_open_lead" };
  const money = await moneyOfTurn(tx, deps, input, lead?.id ?? null);
  if (money !== null && "refused" in money) return money;
  const sent = await sendTurn(tx, deps, input, { payment: money?.payment ?? null, handedOver: handOver !== null });
  const bookingId = money?.bookingId ?? null;
  const told = toldIn({ messages: input.messages, quoted: input.quoted }, input.now);
  const actions = [...(bookingId === null ? [] : ["booking"]), ...sent.codes];
  const turn = { sentWords: input.messages.some((message) => message.trim() !== ""), told };
  if (lead !== null) actions.push(...(await writeTurnOnLead(tx, deps, input, lead, chat, turn)));
  // No open lead (the turn opens one first when an action needs it): a task still reaches the team.
  else actions.push(...(await addTurnTasks(tx, deps, input, null)));
  if (handOver !== null) {
    await tellOfHandOver(tx, input, chat, handOver);
    actions.push(`handover:${handOver.reason}`);
  }
  await assertStillAnswering(tx, input);
  const leadId = lead?.id ?? null;
  const facts = await settleNaturalChat(tx, input, chat, { sent, bookingId, leadId, told, handOver });
  // Read again as the last step before the transaction commits: a pause that landed while act worked must still stop
  // all of it, so it throws and everything above rolls back.
  await assertNotPaused(tx, input);
  return { leadId, sentIds: sent.sentIds, bookingId, handedOver: handOver !== null, actions, facts };
}
