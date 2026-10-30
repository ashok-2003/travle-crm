// What one answer of the autopilot changes: what it remembers of the chat, the reply it sends, the follow-up it plans (inside WhatsApp's window, at the time it chose or the agency's fixed
// hours), what it flags for the team while it keeps selling (the lead's owner hears once in a while, not at every
// message), a note on the lead when the chat told something worth keeping, and a hand-over to a person when it must
// step back.
import type { AgentAnswer } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { addAiLeadNote, noticeKey } from "../crm/index.js";
import { WINDOW_MS } from "../inbox/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { TurnKind } from "./agent-prompt.js";
import type { AutopilotRow } from "./autopilot.js";

export const AI_HANDOFF_KIND = "ai.handoff";
/** A follow-up leaves the window this early, so the customer can still answer for free. */
const WINDOW_MARGIN_MS = 60 * 60_000;
/** A flag tells the lead's owner again only after this long, so a busy chat doesn't ring every few minutes. */
const ATTENTION_QUIET_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;

export interface ChatFacts {
  id: string;
  personId: string | null;
  lastInboundAt: Date | null;
  state: string;
  hidden: boolean;
}

/** When to write again if the customer goes quiet: the agent's choice or the agency's hours, never past the window. */
export function planFollowUp(
  settings: AutopilotRow,
  kind: TurnKind,
  answer: AgentAnswer,
  lastInboundAt: Date | null,
  now: Date,
): { followUpAt: Date | null; followUpReason: string | null } {
  const none = { followUpAt: null, followUpReason: null };
  // One nudge per silence: after it, the next follow-up waits for the customer to write again.
  if (settings.followUpHours === 0 || kind === "nudge" || lastInboundAt === null) return none;
  const hours = settings.smartFollowUp
    ? answer.followUp.needed
      ? Math.min(20, Math.max(1, Math.round(answer.followUp.inHours)))
      : null
    : settings.followUpHours;
  if (hours === null) return none;
  const latest = lastInboundAt.getTime() + WINDOW_MS - WINDOW_MARGIN_MS;
  const at = Math.min(now.getTime() + hours * HOUR_MS, latest);
  if (at <= now.getTime() + 15 * 60_000) return none;
  return {
    followUpAt: new Date(at),
    followUpReason: settings.smartFollowUp && answer.followUp.why.trim() !== "" ? answer.followUp.why.trim() : null,
  };
}

async function tellOwner(
  tx: OrgTx,
  organizationId: string,
  chat: ChatFacts,
  notice: { key: string; title: (name: string) => string; body: string },
) {
  if (chat.personId === null) return;
  const lead = await tx.lead.findFirst({
    where: { personId: chat.personId },
    orderBy: { createdAt: "desc" },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  if (lead === null) return;
  // A lead nobody owns still reaches the members the owner chose for copies of team alerts.
  await notify(tx, systemActor(organizationId), {
    recipientUserIds: lead.ownerUserId === null ? [] : [lead.ownerUserId],
    sourceEventId: noticeKey(notice.key, AI_HANDOFF_KIND),
    kind: AI_HANDOFF_KIND,
    title: notice.title(lead.person.name),
    body: notice.body,
    link: `/inbox/${chat.id}`,
    channels: ["email", "push"],
  });
}

export async function applyAnswer(
  tx: OrgTx,
  input: {
    organizationId: string;
    chat: ChatFacts;
    settings: AutopilotRow;
    kind: TurnKind;
    answer: AgentAnswer;
    model: string;
    token: string;
    /** The chat's lead, for the AI's note on it. */
    leadId: string | null;
    /** Sends the reply; null when there is none to send. */
    sendReply: () => Promise<string | null>;
    now: Date;
  },
): Promise<string> {
  const { answer, chat, now, organizationId } = input;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const state = await tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId: chat.id } },
    create: { conversationId: chat.id, memory: answer.memory },
    update: answer.memory === "" ? {} : { memory: answer.memory },
    select: { id: true, repliesOn: true, repliesCount: true, attentionAt: true },
  });
  // What the chat told that the team should keep, on the lead's timeline.
  if (input.leadId !== null && input.settings.leadNotes && answer.note.trim() !== "") {
    await addAiLeadNote(tx, systemActor(organizationId), input.leadId, answer.note);
  }
  const sent = await input.sendReply();
  if (sent !== null && sent !== "sent") return sent;
  const sameDay = state.repliesOn?.getTime() === today.getTime();
  const attention = answer.handoff ? "" : answer.attention.trim().slice(0, 200);
  await tx.aiChat.update({
    where: { id: state.id },
    data: {
      ...(sent === "sent"
        ? {
            lastReplyAt: now,
            repliesOn: today,
            repliesCount: sameDay ? state.repliesCount + 1 : 1,
            ...(input.kind === "nudge" ? { lastNudgeAt: now } : {}),
          }
        : {}),
      ...planFollowUp(input.settings, input.kind, answer, chat.lastInboundAt, now),
      ...(attention === "" ? {} : { attentionReason: attention, attentionAt: now }),
      ...(answer.handoff
        ? { handedOffAt: now, handoffReason: answer.handoffReason.slice(0, 300) || null, followUpAt: null }
        : {}),
    },
  });
  if (answer.handoff) {
    await tellOwner(tx, organizationId, chat, {
      key: `ai-handoff:${input.token}`,
      title: (name) => `${name} needs you: the AI handed the chat over`,
      body: answer.handoffReason === "" ? "Open the chat to take it from here." : answer.handoffReason.slice(0, 160),
    });
    return "handed_off";
  }
  if (attention !== "") {
    if (state.attentionAt === null || now.getTime() - state.attentionAt.getTime() > ATTENTION_QUIET_MS) {
      await tellOwner(tx, organizationId, chat, {
        key: `ai-attention:${input.token}`,
        title: (name) => `${name}: ${attention}`.slice(0, 120),
        body: "The AI is still answering. Open the chat to join or take over.",
      });
    }
    return "replied_flagged";
  }
  return "replied";
}
