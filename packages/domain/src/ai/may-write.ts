// Whether the AI may write in a chat now (the one agent's turn and its follow-ups): the chat is open, not stopped,
// inside the 24-hour window, not already answered, the agent's switch is on and the chat not switched off, nobody took
// the chat over, the day's count has room.
import type { OrgTx } from "@travel-crm/db";
import { chatOptedOut, windowIsOpen } from "../inbox/index.js";
import type { AutopilotRow } from "./autopilot.js";
import { personAnsweringUntil } from "./person-pause.js";

/** Answer the last message, or nudge a quiet customer. */
export type TurnKind = "reply" | "nudge";

/** The chat row the AI's checks and notices read. */
export interface ChatRow {
  id: string;
  personId: string | null;
  lastInboundAt: Date | null;
  state: string;
  hidden: boolean;
}

/** A follow-up leaves the window this early, so the customer can still answer for free. */
export const WINDOW_MARGIN_MS = 60 * 60_000;

/** The marker of a message the AI wrote: its client token starts with this. */
export const AI_TOKEN_PREFIX = "ai:";

/**
 * Whether the agent answers in a chat by the switches alone: the agency's own switch is on and the chat isn't switched
 * off. A chat's "On" adds nothing while the agency's switch is off: the turn answers no chat then. The inbox adds the
 * setup's readiness (agent-reach.ts).
 */
export const agentAnswers = (mode: string | undefined, autopilot: boolean) => autopilot && mode !== "off";

/** Whether the AI may write in this chat now, and why not when it may not. */
export async function mayWrite(
  tx: OrgTx,
  chat: ChatRow,
  settings: AutopilotRow,
  kind: TurnKind,
  now: Date,
): Promise<string | null> {
  if (chat.state !== "open" || chat.hidden) return "closed";
  // STOP wins first, in every chat: a withdrawn consent, or a STOP in a chat with no person linked.
  if (await chatOptedOut(tx, chat)) return "opted_out";
  if (!windowIsOpen(chat.lastInboundAt, now)) return "window_closed";
  // A reply answers the customer's last message once: a person or the AI itself did if either wrote after it. Other
  // automation (a trip kit for a keyword, a greeting) is no answer, so the AI still replies after it.
  if (kind === "reply" && chat.lastInboundAt !== null) {
    // The team giving the chat back ("Let AI answer now") ends what their earlier messages answered.
    const given = (await tx.aiChat.findFirst({ where: { conversationId: chat.id }, select: { resumedAt: true } }))
      ?.resumedAt;
    const answered = await tx.whatsappMessage.findFirst({
      where: {
        conversationId: chat.id,
        direction: "out",
        occurredAt: { gt: new Date(Math.max(chat.lastInboundAt.getTime(), given?.getTime() ?? 0)) },
        OR: [{ origin: { in: ["staff_crm", "staff_phone"] } }, { clientToken: { startsWith: AI_TOKEN_PREFIX } }],
      },
      select: { id: true },
    });
    if (answered !== null) return "answered";
  }
  const state = await tx.aiChat.findFirst({ where: { conversationId: chat.id } });
  if (!agentAnswers(state?.mode, settings.autopilot)) return "off";
  if (state?.handedOffAt != null) return "handed_off";
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  if (state?.repliesOn?.getTime() === today.getTime() && state.repliesCount >= settings.maxRepliesPerDay)
    return "day_limit";
  return (await personAnsweringUntil(tx, chat.id, now)) === null ? null : "person_answering";
}
