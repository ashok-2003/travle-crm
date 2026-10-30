// The worker's side of the autopilot: a customer's message queues the AI's turn a few seconds later (so a burst of messages
// reads as one, and only the newest is answered), ten chats at a time; each minute, the follow-ups it planned that are
// due go out while the window is open; each night, every agency that lets its AI learn gets a lesson run. Every step asks
// first whether the agency has the AI on, its plan has it and its subscription allows it.
import { aiChatResumedEvent, aiReplyJob } from "@travel-crm/contracts/ai";
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { CUSTOMER_WROTE_EVENT, routesPage, WINDOW_MS } from "../inbox/index.js";
import { defineListener, type EventListener, type JobHandler } from "../jobs/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { aiAllowed } from "./allowed.js";
import { agentAnswers, runAgentTurn, type AgentDependencies } from "./agent.js";
import { autopilotOf } from "./autopilot.js";
import { AI_CHAT_RESUMED_EVENT } from "./chat-state.js";
import { workDueFollowUps } from "./follow-up-work.js";
import { learnFromChats, type LearnDependencies } from "./learning.js";
import { personAnsweringUntil } from "./person-pause.js";
import { aiEnabled } from "./settings.js";

export const AI_REPLY_QUEUE = "ai.reply";
export const AI_NUDGES_QUEUE = "ai.nudges";
export const AI_LEARN_QUEUE = "ai.learn";
/** How long the agent waits after a message for the next one: people send three short lines, not one. */
const SETTLE_MS = 3_000;
/** Chats the agent works on at once. */
const AT_ONCE = 10;
/** A nudge goes no later than this before the window closes, so it can still be answered for free. */
const WINDOW_MARGIN_MS = 60 * 60_000;
const NUDGES_PER_AGENCY = 20;

/** A customer wrote: for an agency whose AI answers this chat, the AI's turn is queued, once per message. */
export function aiCustomerWroteListener(dependencies: {
  queue: JobQueue;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}): EventListener {
  return defineListener({
    name: "ai.autopilot-customer-wrote",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      const { conversationId } = event.payload;
      // Nothing is queued for an agency with no right to the AI.
      if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(event.organizationId))) return;
      const wanted = await context.forOrg(async (tx) => {
        if (!(await aiEnabled(tx))) return false;
        const settings = await autopilotOf(tx);
        const state = await tx.aiChat.findFirst({
          where: { conversationId },
          select: { mode: true, handedOffAt: true },
        });
        // A person answering keeps the AI waiting: no "typing" for a turn that writes nothing.
        const answers =
          agentAnswers(state?.mode, settings.autopilot) &&
          state?.handedOffAt == null &&
          (await personAnsweringUntil(tx, conversationId, new Date())) === null;
        // The inbox says at once that the AI has the message, before it waits for the customer's next line.
        if (answers) {
          await tx.aiChat.upsert({
            where: { organizationId_conversationId: { organizationId: event.organizationId, conversationId } },
            create: { conversationId, turnState: "queued", turnAt: new Date() },
            update: { turnState: "queued", turnAt: new Date() },
          });
        }
        return answers;
      });
      if (!wanted) return;
      await dependencies.queue.send(
        AI_REPLY_QUEUE,
        {
          organizationId: event.organizationId,
          conversationId: event.payload.conversationId,
          messageId: event.payload.messageId,
        },
        { startAfter: new Date(Date.now() + SETTLE_MS), id: event.payload.messageId },
      );
    },
  });
}

/** A chat given back to the AI: its turn for the customer's last message is queued at once, if one waits. */
export function aiChatResumedListener(dependencies: {
  queue: JobQueue;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}): EventListener {
  return defineListener({
    name: "ai.chat-resumed",
    eventType: AI_CHAT_RESUMED_EVENT,
    payload: aiChatResumedEvent,
    handle: async (event, context) => {
      const { conversationId } = event.payload;
      if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(event.organizationId))) return;
      const newest = await context.forOrg(async (tx) => {
        const message = await tx.whatsappMessage.findFirst({
          where: { conversationId, direction: "in" },
          orderBy: { occurredAt: "desc" },
          select: { id: true },
        });
        if (message === null) return null;
        await tx.aiChat.updateMany({ where: { conversationId }, data: { turnState: "queued", turnAt: new Date() } });
        return message;
      });
      if (newest === null) return;
      await dependencies.queue.send(AI_REPLY_QUEUE, {
        organizationId: event.organizationId,
        conversationId,
        messageId: newest.id,
      });
    },
  });
}

/** The agent's turn for one message: only the chat's newest customer message is answered; an earlier one's job ends. */
export function aiReplyHandler(dependencies: AgentDependencies & { logger: Logger }): JobHandler {
  return {
    queue: AI_REPLY_QUEUE,
    concurrency: AT_ONCE,
    handle: async (data) => {
      const job = aiReplyJob.parse(data);
      const newest = await dependencies.db.forOrg(job.organizationId, (tx) =>
        tx.whatsappMessage.findFirst({
          where: { conversationId: job.conversationId, direction: "in" },
          orderBy: { occurredAt: "desc" },
          select: { id: true },
        }),
      );
      if (newest?.id !== job.messageId) return;
      const turn = (turnState: "thinking" | null, only?: "thinking") =>
        dependencies.db.forOrg(job.organizationId, (tx) =>
          tx.aiChat.updateMany({
            where: { conversationId: job.conversationId, ...(only === undefined ? {} : { turnState: only }) },
            data: { turnState, turnAt: new Date() },
          }),
        );
      await turn("thinking");
      try {
        const outcome = await runAgentTurn(
          dependencies,
          {
            organizationId: job.organizationId,
            conversationId: job.conversationId,
            kind: "reply",
            token: job.messageId,
          },
          new Date(),
        );
        dependencies.logger.info({ queue: AI_REPLY_QUEUE, outcome }, "The AI agent's turn");
      } finally {
        // Done; a newer message queued meanwhile keeps its mark.
        await turn(null, "thinking");
      }
    },
  };
}

/**
 * One agency's follow-ups now due: the time the agent planned has come, the customer is still quiet, the window is
 * open. Each is claimed (its time cleared) before its turn, so a turn that writes nothing never comes round again, and
 * one whose window has nearly closed is let go.
 */
async function nudgeAgency(dependencies: AgentDependencies, organizationId: string, now: Date): Promise<number> {
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(organizationId))) return 0;
  const due = await dependencies.db.forOrg(organizationId, async (tx) => {
    if (!(await aiEnabled(tx))) return [];
    const settings = await autopilotOf(tx);
    if (settings.followUpHours === 0) return [];
    const windowFloor = new Date(now.getTime() - WINDOW_MS + WINDOW_MARGIN_MS);
    await tx.aiChat.updateMany({
      where: { followUpAt: { lte: now }, conversation: { lastInboundAt: { lte: windowFloor } } },
      data: { followUpAt: null },
    });
    const rows = await tx.aiChat.findMany({
      where: {
        followUpAt: { lte: now },
        handedOffAt: null,
        mode: settings.autopilot ? { not: "off" } : "on",
        conversation: { state: "open", hidden: false, needsReply: false, lastInboundAt: { gt: windowFloor } },
      },
      orderBy: { followUpAt: "asc" },
      take: NUDGES_PER_AGENCY,
      select: { id: true, lastNudgeAt: true, conversation: { select: { id: true, lastInboundAt: true } } },
    });
    if (rows.length > 0)
      await tx.aiChat.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { followUpAt: null } });
    return rows
      .filter((row) => row.lastNudgeAt === null || (row.conversation.lastInboundAt ?? now) > row.lastNudgeAt)
      .map((row) => row.conversation);
  });
  for (const chat of due) {
    await runAgentTurn(
      dependencies,
      {
        organizationId,
        conversationId: chat.id,
        kind: "nudge",
        token: `nudge:${chat.id}:${String(chat.lastInboundAt?.getTime())}`,
      },
      now,
    );
  }
  return due.length;
}

/**
 * Each minute, every agency with a WhatsApp number: its follow-ups that came due, then its quiet customers' nudges. One
 * agency failing never stops the rest.
 */
export async function runAiNudges(dependencies: AgentDependencies & { logger: Logger }, now: Date): Promise<number> {
  if (!dependencies.ai.configured) return 0;
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const organizationId of new Set(page.map((route) => route.organizationId))) {
      try {
        // Follow-ups first: a chat written to about one is not nudged in the same silence.
        done += await workDueFollowUps(dependencies, organizationId, now);
        done += await nudgeAgency(dependencies, organizationId, now);
      } catch (error) {
        dependencies.logger.error(
          { queue: AI_NUDGES_QUEUE, error: error instanceof Error ? error.name : "unknown" },
          "The AI nudges failed for an agency",
        );
      }
    }
    if (page.length < 100) return done;
    after = page.at(-1)?.integratedNumber;
  }
}

/** Each night, every agency with a WhatsApp number that lets its AI learn: a lesson run. One failing never stops the rest. */
export async function runAiLearning(
  dependencies: LearnDependencies & Pick<AgentDependencies, "subscriptions"> & { logger: Logger },
  now: Date,
): Promise<number> {
  if (!dependencies.ai.configured) return 0;
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const organizationId of new Set(page.map((route) => route.organizationId))) {
      try {
        if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(organizationId))) continue;
        const learning = await dependencies.db.forOrg(
          organizationId,
          async (tx) => (await aiEnabled(tx)) && (await autopilotOf(tx)).learning,
        );
        if (!learning) continue;
        await learnFromChats(dependencies, organizationId, now);
        done += 1;
      } catch (error) {
        dependencies.logger.error(
          { queue: AI_LEARN_QUEUE, error: error instanceof Error ? error.name : "unknown" },
          "The AI's learning failed for an agency",
        );
      }
    }
    if (page.length < 100) return done;
    after = page.at(-1)?.integratedNumber;
  }
}
