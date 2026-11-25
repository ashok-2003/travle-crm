// A customer's photo or PDF read once as it arrives (the owner, 2026-11-25: the agent asked again for a payment screenshot
// and the travellers' names a customer had sent while the team handled the chat). When its file is stored, in a chat the
// agency's AI agent may answer, the worker reads it as look_at_image does and keeps the words on the message, so the
// agent's chat and the chat summary say what it was. Never part of a turn: a turn that starts first reads it itself, and
// whichever reads second finds the words kept and asks no model.
import { aiReadFileJob } from "@travel-crm/contracts/ai";
import { whatsappMediaStoredEvent } from "@travel-crm/contracts/inbox";
import type { Database, OrgTx } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import type { Files } from "../files/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { MEDIA_STORED_EVENT, numberAnswers } from "../inbox/index.js";
import { defineListener, type EventListener, type JobHandler } from "../jobs/index.js";
import { agentPauseOf, type SubscriptionAccess } from "../subscriptions/index.js";
import { agentReachOf } from "./agent-reach.js";
import { aiAllowed } from "./allowed.js";
import { countedModel } from "./natural/counted-model.js";
import type { ReadText } from "./one/media-asking.js";
import { readArrivedFile } from "./one/media.js";
import { aiEnabled } from "./settings.js";

export const AI_READ_FILE_QUEUE = "ai.read-file";
/** Reads at once: each is one model call of a few seconds, and none holds up a turn. */
const AT_ONCE = 3;
/** A photo (a sticker is a kind of its own) or a document, of which only a PDF is read. */
const isReadKind = (kind: string): kind is "image" | "document" => kind === "image" || kind === "document";

/**
 * Whether the agency's AI reads this chat's files: the switches that queue its turn (the AI on and on the plan, not
 * paused, the agent switched on, the chat's number answering, the chat not switched off), but not a person answering or
 * a hand-over: a file sent then is just what the agent would otherwise never see.
 */
async function readsIn(tx: OrgTx, organizationId: string, conversationId: string): Promise<boolean> {
  if (!(await aiEnabled(tx)) || (await agentPauseOf(tx, organizationId)) !== null) return false;
  if ((await agentReachOf(tx, organizationId, new Date())) === "off") return false;
  if (!(await numberAnswers(tx, conversationId))) return false;
  const chat = await tx.aiChat.findFirst({ where: { conversationId }, select: { mode: true } });
  return chat?.mode !== "off";
}

/** A file was stored: a customer's photo or document, not read yet, in a chat the AI reads, is queued to be read once. */
export function aiFileStoredListener(dependencies: {
  queue: JobQueue;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
}): EventListener {
  return defineListener({
    name: "ai.file-stored",
    eventType: MEDIA_STORED_EVENT,
    payload: whatsappMediaStoredEvent,
    handle: async (event, context) => {
      const { conversationId, messageId } = event.payload;
      if (!aiAllowed(await dependencies.subscriptions.entitlementsOf(event.organizationId))) return;
      const wanted = await context.forOrg(async (tx) => {
        const message = await tx.whatsappMessage.findFirst({
          where: { id: messageId, conversationId, direction: "in", aiText: null },
          select: { kind: true },
        });
        return (
          message !== null && isReadKind(message.kind) && (await readsIn(tx, event.organizationId, conversationId))
        );
      });
      if (!wanted) return;
      await dependencies.queue.send(
        AI_READ_FILE_QUEUE,
        { organizationId: event.organizationId, conversationId, messageId },
        { id: messageId },
      );
    },
  });
}

/** The read itself: one model call, counted against the month as look_at_image's; the log holds an outcome, never words. */
export function aiReadFileHandler(dependencies: {
  db: Database;
  files: Files;
  ai: AiModel;
  readText: ReadText;
  logger: Logger;
}): JobHandler {
  const queue = AI_READ_FILE_QUEUE;
  return {
    queue,
    concurrency: AT_ONCE,
    handle: async (data) => {
      const { organizationId, conversationId, messageId } = aiReadFileJob.parse(data);
      const { db, files, ai, readText, logger } = dependencies;
      if (!ai.configured) return;
      const found = await db.forOrg(organizationId, async (tx) => {
        const message = await tx.whatsappMessage.findFirst({
          where: { id: messageId, conversationId, direction: "in" },
          select: { kind: true },
        });
        return message === null
          ? null
          : { kind: message.kind, timeZone: await organizationTimeZone(tx, organizationId) };
      });
      if (found === null || !isReadKind(found.kind)) return;
      const call = countedModel(ai, { db, organizationId, now: new Date(), timeZone: found.timeZone });
      const read = await readArrivedFile(
        { db, files, call, organizationId, readText },
        { conversationId, messageId, kind: found.kind },
      );
      logger.info({ queue, outcome: read.ok ? "read" : "not_read" }, "A customer's file read as it arrived");
    },
  };
}
