// The worker's side of the agent: a customer's message queues the AI's turn a few seconds later (so a burst of messages
// reads as one, and only the newest is answered), three chats at a time; each minute, the follow-ups it planned that are
// due go out while the window is open. Every step asks first whether the agency has the AI on, its plan has it and its
// subscription allows it.
import { aiChatResumedEvent, aiReplyJob } from "@travel-crm/contracts/ai";
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import type { OrgTx } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { CUSTOMER_WROTE_EVENT, routesPage, WINDOW_MS } from "../inbox/index.js";
import { defineListener, type EventListener, type JobHandler } from "../jobs/index.js";
import { agentPauseOf, type SubscriptionAccess } from "../subscriptions/index.js";
import { aiAllowed } from "./allowed.js";
import { agentReachOf, answersInChat } from "./agent-reach.js";
import { runAgentTurn, type AgentDependencies } from "./agent.js";
import { WINDOW_MARGIN_MS } from "./may-write.js";
import { autopilotOf } from "./autopilot.js";
import { AI_CHAT_RESUMED_EVENT } from "./chat-state.js";
import { personAnsweringUntil } from "./person-pause.js";
import { aiEnabled } from "./settings.js";

export const AI_REPLY_QUEUE = "ai.reply";
/** Turns queued here before the earlier agents were removed: drained one at a time, running the same turn. */
export const AI_LITE_REPLY_QUEUE = "ai.lite-reply";
export const AI_NUDGES_QUEUE = "ai.nudges";
/** How long the agent waits after a message for the next one: people send three short lines, not one. */
const SETTLE_MS = 3_000;
/**
 * Turns at once. Each holds a pooled connection through its prepare and its act transactions, many round trips
 * each (turn-cost.test.ts counts them), out of the few the whole worker shares: three leave room for the rest.
 */
const AT_ONCE = 3;
/** The drained queue's pace. */
const DRAINED_AT_ONCE = 1;
/**
 * How late the minute job may reach a lite follow-up and still send it: the lite agent plans one for the margin's very
 * edge (09:00 for a customer who wrote at 10:00), and the job runs a few seconds after its minute, or a little later.
 * One reached later than this (a backlog, an outage) is let go: it was planned for a moment that has passed.
 */
const LITE_LATE_MS = 5 * 60_000;
const NUDGES_PER_AGENCY = 20;

/**
 * Whether a chat's turn is worth queueing, and whether the inbox may say the AI has the message (agent-reach.ts's rule).
 * An agent switched on with its setup unfinished still gets its turn, which writes nothing and tells the owner
 * (not-ready-notice.ts), but nothing says the AI has the message. Read inside the chat's organization, after the AI
 * module and the pause.
 */
async function turnFor(
  tx: OrgTx,
  organizationId: string,
  conversationId: string,
): Promise<{ queue: boolean; mark: boolean }> {
  const now = new Date();
  const reach = await agentReachOf(tx, organizationId, now);
  if (reach === "off") return { queue: false, mark: false };
  const state = await tx.aiChat.findFirst({ where: { conversationId }, select: { mode: true, handedOffAt: true } });
  // A person answering keeps the AI waiting: no "typing" for a turn that writes nothing.
  const takes = answersInChat("ready", state) && (await personAnsweringUntil(tx, conversationId, now)) === null;
  return { queue: takes, mark: takes && answersInChat(reach, state) };
}

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
        if (!(await aiEnabled(tx))) return null;
        if ((await agentPauseOf(tx, event.organizationId)) !== null) return null;
        const turn = await turnFor(tx, event.organizationId, conversationId);
        // The inbox says at once that the AI has the message, before it waits for the customer's next line.
        if (turn.mark) {
          await tx.aiChat.upsert({
            where: { organizationId_conversationId: { organizationId: event.organizationId, conversationId } },
            create: { conversationId, turnState: "queued", turnAt: new Date() },
            update: { turnState: "queued", turnAt: new Date() },
          });
        }
        return turn.queue;
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
        if (!(await aiEnabled(tx))) return null;
        if ((await agentPauseOf(tx, event.organizationId)) !== null) return null;
        const message = await tx.whatsappMessage.findFirst({
          where: { conversationId, direction: "in" },
          orderBy: { occurredAt: "desc" },
          select: { id: true },
        });
        if (message === null) return null;
        // The same rule as a customer's message: being given back set resumedAt, so the team's earlier lines no longer
        // keep it waiting.
        const turn = await turnFor(tx, event.organizationId, conversationId);
        if (turn.mark) {
          await tx.aiChat.updateMany({ where: { conversationId }, data: { turnState: "queued", turnAt: new Date() } });
        }
        return turn.queue ? { id: message.id } : null;
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
function replyHandler(
  dependencies: AgentDependencies & { logger: Logger },
  queue: string,
  concurrency: number,
): JobHandler {
  return {
    queue,
    concurrency,
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
        // Either queue runs the same turn: the drained one only holds what was queued before the move.
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
        dependencies.logger.info({ queue, outcome }, "The AI agent's turn");
      } finally {
        // Done; a newer message queued meanwhile keeps its mark.
        await turn(null, "thinking");
      }
    },
  };
}

/** The reply handlers: the turns, three at once, and the drained queue's, one at once. */
export function aiReplyHandlers(dependencies: AgentDependencies & { logger: Logger }): JobHandler[] {
  return [
    replyHandler(dependencies, AI_REPLY_QUEUE, AT_ONCE),
    replyHandler(dependencies, AI_LITE_REPLY_QUEUE, DRAINED_AT_ONCE),
  ];
}

/**
 * One agency's follow-ups now due: the time the agent planned has come, the customer is still quiet, the window is
 * open. Each is claimed (its time cleared) before its turn, so a turn that writes nothing never comes round again, and
 * one whose window has nearly closed is let go. Two per silence at most: the second follows the first. The clock is read
 * for the claim and again for each turn: the agencies before this one, and each turn here, take seconds each.
 */
async function nudgeAgency(
  dependencies: AgentDependencies,
  organizationId: string,
  clock: () => Date,
): Promise<number> {
  if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(organizationId))) return 0;
  const now = clock();
  const due = await dependencies.db.forOrg(organizationId, async (tx) => {
    if (!(await aiEnabled(tx))) return [];
    // Paused: a follow-up that came due is let go, never kept for later: staff may have handled the chat meanwhile, and
    // a resume means answering again from the next customer message. Those planned for later stay.
    if ((await agentPauseOf(tx, organizationId)) !== null) {
      await tx.aiChat.updateMany({ where: { followUpAt: { lte: now } }, data: { followUpAt: null } });
      return [];
    }
    const settings = await autopilotOf(tx);
    const windowFloor = new Date(now.getTime() - WINDOW_MS + WINDOW_MARGIN_MS - LITE_LATE_MS);
    await tx.aiChat.updateMany({
      where: { followUpAt: { lt: new Date(now.getTime() - LITE_LATE_MS) } },
      data: { followUpAt: null },
    });
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
      select: {
        id: true,
        lastNudgeAt: true,
        followUpsSent: true,
        conversation: { select: { id: true, lastInboundAt: true } },
      },
    });
    if (rows.length > 0)
      await tx.aiChat.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { followUpAt: null } });
    return rows.flatMap((row) => {
      const second = row.followUpsSent === 1;
      const quietSinceNudge = row.lastNudgeAt === null || (row.conversation.lastInboundAt ?? now) > row.lastNudgeAt;
      return quietSinceNudge || second ? [{ ...row.conversation, second }] : [];
    });
  });
  for (const chat of due) {
    // The silence's last customer line names the follow-up, so a retried one sends nothing twice; the second adds ":2".
    const token = `nudge:${chat.id}:${String(chat.lastInboundAt?.getTime())}${chat.second ? ":2" : ""}`;
    // The turn reads the clock again before it acts: waking hours and the window hold when it sends, not when it began.
    await runAgentTurn(
      { ...dependencies, clock },
      { organizationId, conversationId: chat.id, kind: "nudge", token },
      clock(),
    );
  }
  return due.length;
}

/**
 * Each minute, every agency with a WhatsApp number: its quiet customers' nudges that came due. One agency failing never
 * stops the rest. `clock` is read at each step, never once for the run: an agency late in the list is reached minutes
 * after the job began.
 */
export async function runAiNudges(
  dependencies: AgentDependencies & { logger: Logger },
  clock: () => Date,
): Promise<number> {
  if (!dependencies.ai.configured) return 0;
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const organizationId of new Set(page.map((route) => route.organizationId))) {
      try {
        done += await nudgeAgency(dependencies, organizationId, clock);
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
