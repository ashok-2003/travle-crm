// The worker's side of the AI agent: a customer's message queues the agent's turn a few seconds later (so a burst of
// messages reads as one, and only the newest is answered), ten chats at a time; each minute, the follow-ups the agent
// planned that are due go out while the window is open; each night, every agency's AI learns from its chats; and an
// uploaded document's words are read into what the agent knows.
import { aiDocumentAddedEvent, aiReplyJob } from "@travel-crm/contracts/ai";
import { whatsappCustomerWroteEvent } from "@travel-crm/contracts/inbox";
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { AI_KNOWLEDGE_RECORD_TYPE } from "@travel-crm/contracts/files";
import type { Files } from "../files/index.js";
import { CUSTOMER_WROTE_EVENT, routesPage, WINDOW_MS } from "../inbox/index.js";
import { defineListener, type EventListener, type JobHandler } from "../jobs/index.js";
import { agentAnswers, runAgentTurn, type AgentDependencies } from "./agent.js";
import { AI_DOCUMENT_ADDED_EVENT } from "./knowledge.js";
import { learnFromChats, type LearnDependencies } from "./learning.js";
import { aiSettingsOf } from "./settings.js";

export const AI_REPLY_QUEUE = "ai.reply";
export const AI_NUDGES_QUEUE = "ai.nudges";
export const AI_LEARN_QUEUE = "ai.learn";
/** How long the agent waits after a message for the next one: people send three short lines, not one. */
const SETTLE_MS = 6_000;
/** Chats the agent works on at once. */
const AT_ONCE = 10;
/** A nudge goes no later than this before the window closes, so it can still be answered for free. */
const WINDOW_MARGIN_MS = 60 * 60_000;
const NUDGES_PER_AGENCY = 20;

/** A customer wrote: unless the agency uses no AI at all, the agent's turn is queued, once per message. */
export function aiCustomerWroteListener(dependencies: { queue: JobQueue }): EventListener {
  return defineListener({
    name: "ai.customer-wrote",
    eventType: CUSTOMER_WROTE_EVENT,
    payload: whatsappCustomerWroteEvent,
    handle: async (event, context) => {
      const { conversationId } = event.payload;
      const wanted = await context.forOrg(async (tx) => {
        const settings = await aiSettingsOf(tx);
        const state = await tx.aiChat.findFirst({
          where: { conversationId },
          select: { mode: true, handedOffAt: true },
        });
        const answers = agentAnswers(state?.mode, settings.autopilot) && state?.handedOffAt == null;
        // The inbox says at once that the agent has the message, before it waits for the customer's next line.
        if (answers) {
          await tx.aiChat.upsert({
            where: { organizationId_conversationId: { organizationId: event.organizationId, conversationId } },
            create: { conversationId, turnState: "queued", turnAt: new Date() },
            update: { turnState: "queued", turnAt: new Date() },
          });
        }
        return answers || settings.scoring;
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
  const due = await dependencies.db.forOrg(organizationId, async (tx) => {
    const settings = await aiSettingsOf(tx);
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

/** Each minute, every agency with a WhatsApp number: its quiet customers' nudges. One agency failing never stops the rest. */
export async function runAiNudges(dependencies: AgentDependencies & { logger: Logger }, now: Date): Promise<number> {
  if (!dependencies.ai.configured) return 0;
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const organizationId of new Set(page.map((route) => route.organizationId))) {
      try {
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
export async function runAiLearning(dependencies: LearnDependencies & { logger: Logger }, now: Date): Promise<number> {
  if (!dependencies.ai.configured) return 0;
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await routesPage(dependencies.db, { after, limit: 100 });
    for (const organizationId of new Set(page.map((route) => route.organizationId))) {
      try {
        const learning = await dependencies.db.forOrg(organizationId, async (tx) => (await aiSettingsOf(tx)).learning);
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

/** A document was uploaded: its words become what the agent knows, or it is marked failed. */
export function aiDocumentListener(dependencies: {
  db: Database;
  files: Files;
  /** The document's words, or null for a file with none to read. */
  readText: (bytes: Uint8Array, contentType: string) => Promise<string | null>;
}): EventListener {
  return defineListener({
    name: "ai.read-document",
    eventType: AI_DOCUMENT_ADDED_EVENT,
    payload: aiDocumentAddedEvent,
    handle: async (event, context) => {
      const row = await context.forOrg((tx) =>
        tx.aiKnowledge.findUnique({
          where: { id: event.payload.knowledgeId },
          select: { id: true, attachmentId: true, status: true },
        }),
      );
      if (row?.attachmentId == null || row.status !== "reading") return;
      let body = "";
      try {
        const file = await dependencies.files.systemFile(event.organizationId, {
          recordType: AI_KNOWLEDGE_RECORD_TYPE,
          recordId: row.id,
          attachmentId: row.attachmentId,
        });
        body = ((await dependencies.readText(file.body, file.contentType)) ?? "").trim();
      } catch {
        body = "";
      }
      await context.forOrg((tx) =>
        tx.aiKnowledge.update({
          where: { id: row.id },
          data: body === "" ? { status: "failed" } : { status: "ready", body },
        }),
      );
    },
  });
}
