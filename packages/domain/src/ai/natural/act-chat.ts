// What a natural turn leaves on the chat (spec 4.5): the natural facts the next turn reads (the trips and files sent, the
// offer this turn made, the totals told, the booking, the lead, when it ran), the day's reply count, when the AI last
// wrote (the turn's own clock, which its messages carry too, so a reaction on them counts), the follow-up the model
// planned, moved into waking hours, or a follow-up's count, and on a hand-over the reason, audited; and the owner told.
import { naturalFacts, type NaturalFacts, type ToldTotal } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { systemActor } from "../../kernel/index.js";
import { followUpAt, followUpWindowEndOf, intoWakingHours } from "../lite/follow-ups.js";
import { repliesToday, replyDayOf, type ChatRow } from "../may-write.js";
import { tellOwner } from "../tell-owner.js";
import type { SentTurn } from "./act-send.js";
import { stagedOf, type NaturalActInput } from "./act-types.js";
import { handOverText } from "./hand-over-words.js";

const MONTH_MS = 30 * 86_400_000;
const MINUTE_MS = 60_000;

/** What the act's earlier steps did. */
export interface TurnDone {
  sent: SentTurn;
  bookingId: string | null;
  leadId: string | null;
  told: readonly ToldTotal[];
  handOver: { reason: string; summary: string } | null;
}

/** The chat's facts after the turn, as the dry turn writes them (dry-answer.ts), with what really went. */
function factsAfter(input: NaturalActInput, done: TurnDone): NaturalFacts {
  const { facts, now } = input;
  const { tripId, fileIds } = done.sent;
  const known = tripId === null || facts.sentTripIds.includes(tripId);
  return naturalFacts.parse({
    ...facts,
    leadId: done.leadId,
    sentTripIds: known ? facts.sentTripIds : [...facts.sentTripIds, tripId].slice(-50),
    sentFileIds: [...new Set([...facts.sentFileIds, ...fileIds])].slice(-150),
    // The offer made in the last turn that ran (Plan 1, ruling 1): a turn that made none, quiet or not, ends it.
    offer: stagedOf(input.staged, "offer_booking")?.offer ?? null,
    told: [...facts.told.filter((one) => now.getTime() - Date.parse(one.at) <= MONTH_MS), ...done.told].slice(-20),
    bookingId: done.bookingId ?? facts.bookingId,
    lastTurnAt: now.toISOString(),
  });
}

/** A planned time moved into waking hours, in whole minutes, while WhatsApp's window still holds it; else none. */
function wakingTime(at: Date, chat: ChatRow, timeZone: string): Date | null {
  const awake = intoWakingHours(at, timeZone);
  const minute = new Date(Math.floor(awake.getTime() / MINUTE_MS) * MINUTE_MS);
  return chat.lastInboundAt !== null && minute <= followUpWindowEndOf(chat.lastInboundAt) ? minute : null;
}

/**
 * The follow-ups a turn leaves. A reply starts the count again with the time the model planned, when its words went and
 * no person must answer next. A follow-up that went counts itself, and the first plans the second as lite's does,
 * about 20 hours after the customer's line; anything else plans none.
 */
function followUpsAfter(
  input: NaturalActInput,
  chat: ChatRow,
  state: { followUpsSent: number; followUpReason: string | null },
  turn: { sent: boolean; handedOver: boolean },
) {
  const keepsGoing = turn.sent && !turn.handedOver;
  if (input.kind === "reply") {
    const plan = stagedOf(input.staged, "plan_follow_up");
    const at = keepsGoing && plan?.at != null ? wakingTime(plan.at, chat, input.timeZone) : null;
    // The model plans them now: a stop lite's words left on the chat is lite's.
    return {
      followUpsSent: 0,
      followUpAt: at,
      followUpReason: at === null ? null : (plan?.about ?? null),
      followUpsStopped: false,
    };
  }
  if (!keepsGoing) return { followUpAt: null, followUpReason: null };
  const number = Math.min(state.followUpsSent + 1, 2);
  const { lastInboundAt } = chat;
  const next =
    number === 1 && lastInboundAt !== null
      ? followUpAt({
          number: 2,
          conversationId: chat.id,
          lastInboundAt,
          repliedAt: input.now,
          previousAt: input.now,
          now: input.now,
          timeZone: input.timeZone,
        })
      : null;
  return { followUpsSent: number, followUpAt: next, followUpReason: next === null ? null : state.followUpReason };
}

/** Settles the chat after the turn; returns the facts the next turn reads. */
export async function settleNaturalChat(
  tx: OrgTx,
  input: NaturalActInput,
  chat: ChatRow,
  done: TurnDone,
): Promise<NaturalFacts> {
  const { organizationId, conversationId, now } = input;
  const facts = factsAfter(input, done);
  const state = await tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId } },
    create: { conversationId, facts },
    update: { facts },
    select: { id: true, repliesOn: true, repliesCount: true, followUpsSent: true, followUpReason: true },
  });
  const sent = done.sent.sentIds.length > 0;
  // Counted for the day's cap only when something went; the time is the turn's, which its messages carry too.
  const counted = sent
    ? {
        lastReplyAt: now,
        repliesOn: replyDayOf(now),
        repliesCount: repliesToday(state, now) + 1,
        ...(input.kind === "nudge" ? { lastNudgeAt: now } : {}),
      }
    : {};
  const reason = done.handOver === null ? null : handOverText(done.handOver);
  await tx.aiChat.update({
    where: { id: state.id },
    data: {
      ...counted,
      ...followUpsAfter(input, chat, state, { sent, handedOver: reason !== null }),
      ...(reason === null ? {} : { handedOffAt: now, handoffReason: reason }),
    },
  });
  if (done.handOver !== null) {
    // By its code alone: the summary may hold the customer's words.
    await recordAudit(tx, systemActor(organizationId), {
      action: "ai.chat-handed-off",
      entityType: "whatsapp_conversation",
      entityId: conversationId,
      after: { reason: done.handOver.reason },
    });
  }
  return facts;
}

/** Tells the lead's owner the AI handed the chat over and why, once for the turn. */
export async function tellOfHandOver(
  tx: OrgTx,
  input: NaturalActInput,
  chat: ChatRow,
  handOver: { reason: string; summary: string },
): Promise<void> {
  await tellOwner(tx, input.organizationId, chat, {
    key: `ai-handoff:${input.token}`,
    title: (name) => `${name} needs you: the AI handed the chat over`,
    body: handOverText(handOver),
  });
}
