// What a lite turn leaves on the chat: the facts it settled (with the files sent and the booking taken), the summary,
// the reply count, no follow-up planned (plan 3b plans them) but whether the customer stopped them, and on a hand-over
// the reason for the team, the owner told.
import type { OrgTx } from "@travel-crm/db";
import { tellOwner, type ChatFacts } from "../agent-effects.js";
import type { LiteActInput } from "./act-types.js";
import { handOverSentences } from "./act-words.js";
import { saveChatSummary } from "./lead-writes.js";
import { saveLiteFacts } from "./merge.js";
import type { Decision } from "./types.js";

const REASON_MAX = 300;

export async function settleChat(
  tx: OrgTx,
  input: LiteActInput & { decision: Decision },
  chat: ChatFacts,
  done: { fileIds: string[]; bookingId: string | null; sent: boolean },
): Promise<void> {
  const { decision, now, conversationId } = input;
  const { facts, move } = decision;
  await saveLiteFacts(tx, conversationId, {
    ...facts,
    sentFileIds: [...new Set([...facts.sentFileIds, ...done.fileIds])],
    bookingId: done.bookingId ?? facts.bookingId,
  });
  if (input.checked !== null) await saveChatSummary(tx, conversationId, input.checked.form.summary);
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const state = await tx.aiChat.findFirstOrThrow({
    where: { conversationId },
    select: { id: true, repliesOn: true, repliesCount: true },
  });
  const reason = move.kind === "hand_over" ? handOverSentences[move.reason].slice(0, REASON_MAX) : null;
  // Counted as the grounded turn counts them, for the day's cap, but only for a turn that sent something.
  const counted = done.sent
    ? {
        lastReplyAt: now,
        repliesOn: today,
        repliesCount: state.repliesOn?.getTime() === today.getTime() ? state.repliesCount + 1 : 1,
        ...(input.kind === "reply" ? {} : { lastNudgeAt: now }),
      }
    : {};
  await tx.aiChat.update({
    where: { id: state.id },
    data: {
      ...counted,
      followUpAt: null,
      followUpReason: null,
      // The customer's newest words decide it: a later reply that isn't "not interested" or "later" starts them again.
      ...(input.kind === "reply" ? { followUpsStopped: decision.stopFollowUps } : {}),
      ...(reason === null ? {} : { handedOffAt: now, handoffReason: reason }),
    },
  });
  if (reason !== null) {
    await tellOwner(tx, input.organizationId, chat, {
      key: `ai-handoff:${input.token}`,
      title: (name) => `${name} needs you: the AI handed the chat over`,
      body: reason,
    });
  }
}
