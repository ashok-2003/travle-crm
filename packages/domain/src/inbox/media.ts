// Copying an inbound file into our storage (spec 4.3 I4): MSG91's link dies after 30 days, so each file is downloaded at once
// through the port (size cap, type allowlist, timeout), stored as an attachment on the record type whatsapp_message, and the
// link blanked. It retries with backoff for 25 days, then the photo is "expired". The job carries ids only; the file is the
// customer's, and nothing is rendered or resized on our server.
import { WHATSAPP_RECORD_TYPE, whatsappContentTypes } from "@travel-crm/contracts/files";
import { ownMessage, type JobData } from "@travel-crm/integrations/jobs";
import { systemActor } from "../kernel/index.js";
import { isUuid } from "../kernel/index.js";
import type { InboxDependencies } from "./dependencies.js";
import { noticeKey } from "../crm/index.js";
import { notifyNeedsAttention } from "./attention.js";
import { bumpUsage, monthStartOf } from "./usage.js";

export const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const GIVE_UP_AFTER_MS = 25 * 24 * 60 * 60 * 1000;

const extensionOf: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
};

export type CopyResult = "stored" | "gone" | "expired" | "failed" | "retry";

/** Copies one message's file. A transient failure throws, so the job is retried; the other outcomes end it. */
export async function copyMedia(
  dependencies: InboxDependencies,
  organizationId: string,
  messageId: string,
  now: Date,
): Promise<CopyResult> {
  const { db, provider, files } = dependencies;
  if (provider === null) throw ownMessage(new Error("WhatsApp is not set up on this process"));
  const message = await db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        mediaState: true,
        mediaUrl: true,
        fileName: true,
        kind: true,
        createdAt: true,
        conversation: { select: { connectionId: true } },
      },
    }),
  );
  if (message?.mediaState !== "pending" || message.mediaUrl === null) return "gone";

  const result = await provider.downloadMedia(message.mediaUrl, {
    maxBytes: MAX_MEDIA_BYTES,
    allowedTypes: whatsappContentTypes,
  });
  const settle = (state: "expired" | "failed", code: string) =>
    db.forOrg(organizationId, (tx) =>
      tx.whatsappMessage.update({
        where: { id: messageId },
        data: { mediaState: state, mediaUrl: null, failureCode: code, mediaAttempts: { increment: 1 } },
      }),
    );
  /** The agency's storage is full: everyone who can assign leads is told (once an hour, never a word of the file). */
  const tellStorageFull = async () => {
    const managers = await dependencies.managers(organizationId);
    await db.forOrg(organizationId, (tx) =>
      notifyNeedsAttention(tx, systemActor(organizationId), {
        recipientUserIds: managers,
        title: "WhatsApp can't keep customers' files: storage is full",
        body: "Free some space or ask us to raise the plan's storage.",
        sourceEventId: noticeKey(messageId, "whatsapp.needs-attention"),
        now,
      }),
    );
  };
  if (!result.ok) {
    if (result.reason === "expired") {
      await settle("expired", "media_expired");
      return "expired";
    }
    if (result.reason === "too_big" || result.reason === "bad_type") {
      await settle("failed", result.reason);
      return "failed";
    }
    if (now.getTime() - message.createdAt.getTime() > GIVE_UP_AFTER_MS) {
      await settle("expired", "media_expired");
      return "expired";
    }
    await db.forOrg(organizationId, (tx) =>
      tx.whatsappMessage.update({ where: { id: messageId }, data: { mediaAttempts: { increment: 1 } } }),
    );
    throw ownMessage(new Error("A WhatsApp file could not be downloaded yet"));
  }
  const extension = extensionOf[result.contentType];
  const baseName = (message.fileName ?? `whatsapp-${message.kind}`)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replaceAll(/\p{Cc}/gu, "_")
    .slice(0, 120);
  const fileName =
    extension === undefined || baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`;
  try {
    await files.storeGeneratedFile(systemActor(organizationId), {
      recordType: WHATSAPP_RECORD_TYPE,
      recordId: messageId,
      fileName,
      contentType: result.contentType,
      body: result.bytes,
      attachmentId: messageId,
    });
  } catch (error) {
    if (
      (error as { reason?: unknown }).reason === "STORAGE_LIMIT_REACHED" ||
      (error as { reason?: unknown }).reason === "STORAGE_FULL"
    ) {
      await settle("failed", "storage_full");
      await tellStorageFull();
      return "failed";
    }
    throw error;
  }
  await db.forOrg(organizationId, async (tx) => {
    await tx.whatsappMessage.update({
      where: { id: messageId },
      data: { mediaState: "stored", mediaUrl: null, mediaAttempts: { increment: 1 } },
    });
    await bumpUsage(
      tx,
      { organizationId, connectionId: message.conversation.connectionId },
      monthStartOf(now, "Asia/Kolkata"),
      {
        mediaBytesCopied: result.bytes.byteLength,
      },
    );
  });
  return "stored";
}

/** The handler of a whatsapp.copy-media job. */
export async function copyMediaJob(dependencies: InboxDependencies, data: JobData): Promise<CopyResult> {
  const { organizationId, messageId } = data;
  if (
    typeof organizationId !== "string" ||
    typeof messageId !== "string" ||
    !isUuid(organizationId) ||
    !isUuid(messageId)
  ) {
    throw ownMessage(new Error("A whatsapp.copy-media job needs an organizationId and a messageId"));
  }
  return copyMedia(dependencies, organizationId, messageId, new Date());
}
