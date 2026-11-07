// Whether the AI may write in a chat now (shared by the first agent and the grounded turn): the chat is open, not stopped,
// inside the 24-hour window, not already answered, the autopilot is on, nobody took the chat over, the day's count has room.
import type { OrgTx } from "@travel-crm/db";
import { chatOptedOut, windowIsOpen } from "../inbox/index.js";
import type { ChatFacts } from "./agent-effects.js";
import type { TurnKind } from "./agent-prompt.js";
import type { AutopilotRow } from "./autopilot.js";
import { personAnsweringUntil } from "./person-pause.js";

/** The marker of a message the AI wrote: its client token starts with this. */
export const AI_TOKEN_PREFIX = "ai:";

/** Whether the autopilot answers in a chat: its own mode, else the agency's autopilot. */
export const agentAnswers = (mode: string | undefined, autopilot: boolean) =>
  mode === "on" || (mode !== "off" && autopilot);

/** Whether the AI may write in this chat now, and why not when it may not. */
export async function mayWrite(
  tx: OrgTx,
  chat: ChatFacts,
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
