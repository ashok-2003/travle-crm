// The follow-up's own gates, which the one agent's follow-up keeps from the natural agent's (ruling 13): fewer than two
// sent, the silence unbroken since the last turn that ran, an open lead, the agency's waking hours; and the notice the
// model reads beside the chat.
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { LiteDependencies, LiteOutcome, LiteTurnInput } from "../lite/types.js";
import { inWakingHours, nextMorning, stillQuiet } from "../lite/follow-ups.js";
import type { NaturalPrepared } from "./prepare.js";

const MOST_FOLLOW_UPS = 2;

/** The live turn's dependencies (`NaturalTurnDependencies` in turn.ts, which routes here): lite's, and Langfuse's prompts. */
export interface NudgeDependencies extends LiteDependencies {
  prompts?: AiPrompts;
}

/** What the model reads beside the chat: which follow-up this is, since when, and what is asked of it. */
export const nudgeNotice = (number: number, quietSince: string) =>
  `This is follow-up ${String(number)} of ${String(MOST_FOLLOW_UPS)}, and the customer has been quiet since ${quietSince}; ` +
  "there are no new messages. Write one short, warm line as yourself, picking up where the chat left off, or call " +
  "stay_quiet if there is nothing worth saying. Never pushy, and never the same words as before.";

/**
 * The follow-up's own gates, read once the turn's shared ones passed: how many went already (the number of this one),
 * the day's cap and the month's limit, the silence (a 👍 on ours answers; counted from the last turn that ran, so an "ok"
 * a quiet turn read does not end it), the open lead, and the waking hours, which hold it until 09:00 while the window
 * still can.
 */
export async function nudgeGate(
  deps: NudgeDependencies,
  input: LiteTurnInput,
  prepared: NaturalPrepared,
  now: Date,
): Promise<number | LiteOutcome> {
  const { chat, facts, timeZone } = prepared;
  const quietSince = facts.lastTurnAt === null ? null : new Date(facts.lastTurnAt);
  return deps.db.forOrg(input.organizationId, async (tx) => {
    const state = await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { followUpsSent: true } });
    // Two went already: a time left on the chat brings no third.
    if (state === null || state.followUpsSent >= MOST_FOLLOW_UPS) return "nothing";
    if (prepared.monthFull) return "limit";
    if (prepared.repliesToday >= prepared.dayCap) return "day_limit";
    if (!(await stillQuiet(tx, chat.id, { reactions: true, since: quietSince }))) return "answered";
    // A lead the team closed with no word to the customer was a person's decision, and a follow-up never opens one.
    if (prepared.leadId === null) return "no_open_lead";
    if (!inWakingHours(now, timeZone)) {
      const morning = chat.lastInboundAt === null ? null : nextMorning(now, chat.lastInboundAt, timeZone);
      if (morning !== null) {
        await tx.aiChat.updateMany({
          where: { conversationId: chat.id, followUpAt: null },
          data: { followUpAt: morning },
        });
      }
      return "night";
    }
    return state.followUpsSent + 1;
  });
}
