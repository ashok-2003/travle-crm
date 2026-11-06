// What a checked reply leaves on the chat: the facts it settled, the reply count, a flag or a hand-over for the team, and the
// note and follow-up it asked for. The flag is the string "<codes>: <reason>" and is only stored, never logged.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { addAiFollowUp, addAiLeadNote } from "../../crm/index.js";
import { systemActor } from "../../kernel/index.js";
import { ATTENTION_QUIET_MS, tellOwner } from "../agent-effects.js";
import type { ActInput } from "./act-types.js";
import { saveFacts } from "./facts.js";

const HOUR_MS = 3_600_000;

export async function settleChat(
  tx: OrgTx,
  input: ActInput,
  settled: { facts: ChatFacts; leadId: string | null },
): Promise<{ flagged: boolean; handedOver: boolean }> {
  const { actions, now, organizationId } = input;
  const actor = systemActor(organizationId);
  await saveFacts(tx, input.conversationId, settled.facts);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const state = await tx.aiChat.findFirstOrThrow({
    where: { conversationId: input.conversationId },
    select: { id: true, repliesOn: true, repliesCount: true, attentionAt: true },
  });
  const chat = await tx.whatsappConversation.findUniqueOrThrow({
    where: { id: input.conversationId },
    select: { id: true, personId: true, lastInboundAt: true, state: true, hidden: true },
  });
  if (settled.leadId !== null && actions.note !== null) await addAiLeadNote(tx, actor, settled.leadId, actions.note);
  if (settled.leadId !== null && actions.task !== null) {
    const dueAt = new Date(now.getTime() + actions.task.dueInHours * HOUR_MS);
    await addAiFollowUp(tx, actor, { leadId: settled.leadId, title: actions.task.title, dueAt }, now);
  }
  const handedOver = actions.handOver !== null;
  const handOverWhy = actions.handOver?.slice(0, 160) ?? "";
  const attention = handedOver ? "" : (actions.flag?.trim().slice(0, 200) ?? "");
  await tx.aiChat.update({
    where: { id: state.id },
    data: {
      lastReplyAt: now,
      repliesOn: today,
      repliesCount: state.repliesOn?.getTime() === today.getTime() ? state.repliesCount + 1 : 1,
      ...(attention === "" ? {} : { attentionReason: attention, attentionAt: now }),
      ...(handedOver
        ? { handedOffAt: now, handoffReason: actions.handOver?.slice(0, 300) ?? null, followUpAt: null }
        : {}),
    },
  });
  if (handedOver) {
    await tellOwner(tx, organizationId, chat, {
      key: `ai-handoff:${input.token}`,
      title: (name) => `${name} needs you: the AI handed the chat over`,
      body: handOverWhy === "" ? "Open the chat to take it from here." : handOverWhy,
    });
  } else if (
    attention !== "" &&
    (state.attentionAt === null || now.getTime() - state.attentionAt.getTime() > ATTENTION_QUIET_MS)
  ) {
    await tellOwner(tx, organizationId, chat, {
      key: `ai-attention:${input.token}`,
      title: (name) => `${name}: ${attention}`.slice(0, 120),
      body: "The AI is still answering. Open the chat to join or take over.",
    });
  }
  return { flagged: attention !== "", handedOver };
}
