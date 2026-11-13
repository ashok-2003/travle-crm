// The lite agent's follow-ups (plan 3b): at most two per silence, the first about 4 hours after its reply and the second
// about 20 hours after the customer's last message, only 9 am to 9 pm on the agency's clock and inside WhatsApp's
// 24-hour window less its margin. What each turn leaves for them, and whether the silence one goes into still stands.
import type { OrgTx } from "@travel-crm/db";
import { WINDOW_MS } from "../../inbox/index.js";
import { addDays, calendarDateIn, instantAt, parseTimeOfDay, timeOfDayIn } from "../../kernel/index.js";
import { WINDOW_MARGIN_MS } from "../agent-effects.js";
import type { TurnKind } from "../agent-prompt.js";
import type { Move } from "./types.js";

export const FOLLOW_UP_AFTER_REPLY_HOURS = 4;
export const FOLLOW_UP_AFTER_INBOUND_HOURS = 20;
/** The agency's waking hours: a follow-up goes from `from` until just before `until`, never at night. */
export const WAKING_HOURS = { from: "09:00", until: "21:00" } as const;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
/** One planned sooner than this would read as part of what was just sent. */
const SOONEST_MS = 15 * MINUTE_MS;
/** Two follow-ups this close would crowd the customer: the second is let go instead. */
const APART_MS = HOUR_MS;
const wakes = parseTimeOfDay(WAKING_HOURS.from);
const sleeps = parseTimeOfDay(WAKING_HOURS.until);

/** The time, moved into waking hours: before 09:00 to 09:00 that day, at or after 21:00 to 09:00 the next. */
function intoWakingHours(at: Date, timeZone: string): Date {
  const day = calendarDateIn(at, timeZone);
  const time = timeOfDayIn(at, timeZone);
  if (time < wakes) return instantAt(day, wakes, timeZone);
  if (time >= sleeps) return instantAt(addDays(day, 1), wakes, timeZone);
  return at;
}

/** `end` itself when it falls in waking hours, else the last waking minute (20:59) of the last day before it with one. */
function lastWakingBy(end: Date, timeZone: string): Date {
  const day = calendarDateIn(end, timeZone);
  const time = timeOfDayIn(end, timeZone);
  if (time >= wakes && time < sleeps) return end;
  const lastDay = time >= sleeps ? day : addDays(day, -1);
  return new Date(instantAt(lastDay, sleeps, timeZone).getTime() - MINUTE_MS);
}

/** When follow-up `number` should go, or null when no time fits. */
export function followUpAt(input: {
  number: 1 | 2;
  lastInboundAt: Date;
  repliedAt: Date;
  previousAt: Date | null;
  now: Date;
  timeZone: string;
}): Date | null {
  const { number, lastInboundAt, timeZone } = input;
  const target =
    number === 1
      ? input.repliedAt.getTime() + FOLLOW_UP_AFTER_REPLY_HOURS * HOUR_MS
      : lastInboundAt.getTime() + FOLLOW_UP_AFTER_INBOUND_HOURS * HOUR_MS;
  const windowEnd = new Date(lastInboundAt.getTime() + WINDOW_MS - WINDOW_MARGIN_MS);
  let at = intoWakingHours(new Date(target), timeZone);
  if (at > windowEnd) at = lastWakingBy(windowEnd, timeZone);
  if (at.getTime() < input.now.getTime() + SOONEST_MS) return null;
  if (number === 2 && input.previousAt !== null && at.getTime() < input.previousAt.getTime() + APART_MS) return null;
  return at;
}

/**
 * What a turn leaves for the follow-ups. A reply starts the count again, and plans the first only when it sent a
 * message that keeps the sale going (no hand-over, no silence, nothing that stopped them); a follow-up that went counts
 * itself and plans the next, the first's second and the second's none. Anything else plans none.
 */
export function followUpPlan(turn: {
  kind: TurnKind;
  move: Move;
  stopFollowUps: boolean;
  sent: boolean;
  lastInboundAt: Date | null;
  now: Date;
  timeZone: string;
}): { followUpAt: Date | null; followUpsSent?: 0 | 1 | 2 } {
  const { move, lastInboundAt, now, timeZone } = turn;
  const timed = (number: 1 | 2) =>
    lastInboundAt === null
      ? null
      : followUpAt({ number, lastInboundAt, repliedAt: now, previousAt: number === 2 ? now : null, now, timeZone });
  if (turn.kind === "reply") {
    const keepsGoing = turn.sent && move.kind !== "hand_over" && move.kind !== "silent" && !turn.stopFollowUps;
    return { followUpsSent: 0, followUpAt: keepsGoing ? timed(1) : null };
  }
  if (turn.kind === "nudge" && move.kind === "follow_up" && turn.sent) {
    return { followUpsSent: move.number, followUpAt: move.number === 1 ? timed(2) : null };
  }
  return { followUpAt: null };
}

/**
 * Whether the chat is still quiet since the AI's last message, so a follow-up may go into the silence: the customer has
 * not written, nobody on the team has, and the customer's last words did not stop them.
 */
export async function stillQuiet(tx: OrgTx, conversationId: string): Promise<boolean> {
  const state = await tx.aiChat.findFirst({
    where: { conversationId },
    select: { lastReplyAt: true, followUpsStopped: true },
  });
  if (state?.lastReplyAt == null || state.followUpsStopped) return false;
  const since = await tx.whatsappMessage.findFirst({
    where: {
      conversationId,
      occurredAt: { gt: state.lastReplyAt },
      OR: [{ direction: "in" }, { origin: { in: ["staff_crm", "staff_phone"] } }],
    },
    select: { id: true },
  });
  return since === null;
}
