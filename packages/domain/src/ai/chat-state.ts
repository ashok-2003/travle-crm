// The autopilot as staff see and steer it: a chat's AI state (answering or not, handed over and why, what it remembers),
// turning it on or off in one chat, giving a handed-over chat back to it, and what the chat's AI is for. Every change is
// audited.
import type { ChatAi } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { agentAnswers } from "./agent.js";
import { autopilotOf } from "./autopilot.js";
import { personAnsweringUntil } from "./person-pause.js";
import { agencyVoiceOf } from "./voice.js";

/** After this long a turn still marked is one the worker never finished (it stopped): the inbox stops showing it. */
const TURN_STALE_MS = 3 * 60_000;
/** What the AI flagged shows in the chat this long. */
const ATTENTION_SHOWN_MS = 24 * 3_600_000;

/** Published when someone gives a chat back to the AI: the worker queues its turn at once. */
export const AI_CHAT_RESUMED_EVENT = "ai.chat-resumed";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** `available`: the AI is configured on this server and allowed for the agency (plan, subscription, its own switch). */
export async function chatAiOf(tx: OrgTx, conversationId: string, available: boolean): Promise<ChatAi> {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (chat === null) throw notFound();
  const settings = await autopilotOf(tx);
  const state = await tx.aiChat.findFirst({ where: { conversationId } });
  const voice = await agencyVoiceOf(tx);
  const mode = state?.mode === "on" || state?.mode === "off" ? state.mode : "default";
  const answering = available && agentAnswers(mode, settings.autopilot) && state?.handedOffAt == null;
  // A turn the worker left behind (it stopped mid-way) is no turn after a few minutes.
  const turnFresh = state?.turnAt != null && Date.now() - state.turnAt.getTime() < TURN_STALE_MS;
  const turnState = state?.turnState === "queued" || state?.turnState === "thinking" ? state.turnState : null;
  return {
    mode,
    answering,
    handedOff: state?.handedOffAt != null,
    handoffReason: state?.handoffReason ?? null,
    memory: state?.memory ?? "",
    lastReplyAt: state?.lastReplyAt?.toISOString() ?? null,
    turn: answering && turnFresh ? turnState : null,
    followUpAt: answering && state?.followUpAt != null ? state.followUpAt.toISOString() : null,
    followUpReason: answering ? (state?.followUpReason ?? null) : null,
    attention:
      state?.attentionAt != null && Date.now() - state.attentionAt.getTime() < ATTENTION_SHOWN_MS
        ? (state.attentionReason ?? null)
        : null,
    personPausedUntil: answering
      ? ((await personAnsweringUntil(tx, conversationId, new Date()))?.toISOString() ?? null)
      : null,
    voice: voice === null ? null : { name: voice.name, profile: voice.profile, examples: voice.examples.length },
    persona: state?.persona === "sales" || state?.persona === "natural" ? state.persona : "default",
    agentName: settings.agentName,
    available,
  };
}

async function chatState(tx: OrgTx, organizationId: string, conversationId: string) {
  const chat = await tx.whatsappConversation.findUnique({ where: { id: conversationId }, select: { id: true } });
  if (chat === null) throw notFound();
  return tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId } },
    create: { conversationId },
    update: {},
    select: { id: true, mode: true, persona: true },
  });
}

/** The AI on, off, or as the agency's autopilot says, in one chat. Turning it on gives a handed-over chat back. */
export async function setChatMode(
  tx: OrgTx,
  access: MemberAccess,
  input: { conversationId: string; mode: "default" | "on" | "off" },
): Promise<void> {
  const state = await chatState(tx, access.organizationId, input.conversationId);
  await tx.aiChat.update({
    where: { id: state.id },
    data: {
      mode: input.mode,
      ...(input.mode === "on" ? { handedOffAt: null, handoffReason: null, resumedAt: new Date() } : {}),
      // Taken over: the flag is answered, and the AI's planned follow-up is the person's to make.
      ...(input.mode === "off" ? { attentionAt: null, attentionReason: null, followUpAt: null } : {}),
    },
  });
  // Turned on: it answers what waits, now.
  if (input.mode === "on") {
    await publishEvent(tx, { type: AI_CHAT_RESUMED_EVENT, payload: { conversationId: input.conversationId } });
  }
  await recordAudit(tx, access, {
    action: "ai.chat-mode-changed",
    entityType: "whatsapp_conversation",
    entityId: input.conversationId,
    before: { mode: state.mode },
    after: { mode: input.mode },
  });
}

/**
 * A chat goes back to the AI ("Let AI answer now"): a hand-over ends, the team's earlier messages stop keeping it waiting,
 * and it answers the customer's last message at once.
 */
export async function resumeChat(tx: OrgTx, access: MemberAccess, conversationId: string): Promise<void> {
  const state = await chatState(tx, access.organizationId, conversationId);
  await tx.aiChat.update({
    where: { id: state.id },
    data: { handedOffAt: null, handoffReason: null, resumedAt: new Date() },
  });
  await publishEvent(tx, { type: AI_CHAT_RESUMED_EVENT, payload: { conversationId } });
  await recordAudit(tx, access, {
    action: "ai.chat-resumed",
    entityType: "whatsapp_conversation",
    entityId: conversationId,
  });
}

/** One chat's AI is a sales agent, an everyday conversation, or as the agency says; audited. */
export async function setChatPersona(
  tx: OrgTx,
  access: MemberAccess,
  input: { conversationId: string; persona: "default" | "sales" | "natural" },
): Promise<void> {
  const before = await chatState(tx, access.organizationId, input.conversationId);
  await tx.aiChat.update({ where: { id: before.id }, data: { persona: input.persona } });
  await recordAudit(tx, access, {
    action: "ai.chat-persona-changed",
    entityType: "whatsapp_conversation",
    entityId: input.conversationId,
    before: { persona: before.persona },
    after: { persona: input.persona },
  });
}
