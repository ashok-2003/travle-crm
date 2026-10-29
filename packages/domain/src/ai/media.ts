// The agency's media for its AI (the owner, 2026-10-29): photos, videos and PDFs (a brochure, a hotel's photos, an
// itinerary) the agent sends in a chat when they help, each with when it should, in the agency's words. A file goes
// straight from the browser to storage; the agent chooses by number and code copies the file onto the WhatsApp message
// that sends it (as a trip's details do), so the library keeps its own. Written by whoever manages settings; audited.
import { AI_MEDIA_RECORD_TYPE, WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  aiMediaList,
  MAX_AI_MEDIA_PER_REPLY,
  type AiMediaItem,
  type RequestAiMediaInput,
  type UpdateAiMediaInput,
} from "@travel-crm/contracts/ai";
import { softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { kindOf, queueSystemText } from "../inbox/index.js";
import { DomainError, newUuidV7, systemActor } from "../kernel/index.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
const columns = {
  id: true,
  title: true,
  whenToSend: true,
  fileName: true,
  contentType: true,
  ready: true,
  enabled: true,
  updatedAt: true,
} as const;

/** The end of the client token of a message that sent this media: how often it went is counted by it. */
const tokenEnd = (mediaId: string) => `:media:${mediaId}`;

export async function listMedia(tx: OrgTx): Promise<AiMediaItem[]> {
  const rows = await tx.aiMedia.findMany({ orderBy: { createdAt: "desc" }, select: columns });
  const items = [];
  for (const row of rows) {
    const sent = await tx.whatsappMessage.count({ where: { clientToken: { endsWith: tokenEnd(row.id) } } });
    items.push({ ...row, sent, updatedAt: row.updatedAt.toISOString() });
  }
  return aiMediaList.parse(items);
}

const audit = (
  tx: OrgTx,
  access: MemberAccess,
  action: "ai.media-added" | "ai.media-changed" | "ai.media-deleted",
  id: string,
  title: string,
) =>
  recordAudit(tx, access, {
    action,
    entityType: "ai_media",
    entityId: id,
    ...(action === "ai.media-deleted" ? { before: { title } } : { after: { title } }),
  });

/** Step one: the row (not ready) and where the browser puts the file. */
export async function requestMedia(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  input: RequestAiMediaInput,
) {
  const mediaId = newUuidV7();
  const { attachment, upload } = await files.requestUpload(access, {
    recordType: AI_MEDIA_RECORD_TYPE,
    recordId: mediaId,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  await db.forOrg(access.organizationId, async (tx) => {
    await tx.aiMedia.create({
      data: {
        id: mediaId,
        title: input.title,
        whenToSend: input.whenToSend,
        attachmentId: attachment.id,
        fileName: input.fileName,
        contentType: input.contentType,
        createdBy: access.userId,
      },
    });
    await audit(tx, access, "ai.media-added", mediaId, input.title);
  });
  return { mediaId, attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

/** Step two: the file is stored, so the agent may send it. */
export async function confirmMedia(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  input: { mediaId: string; attachmentId: string },
): Promise<void> {
  await files.confirmUpload(access, {
    recordType: AI_MEDIA_RECORD_TYPE,
    recordId: input.mediaId,
    attachmentId: input.attachmentId,
  });
  await db.forOrg(access.organizationId, (tx) =>
    tx.aiMedia.updateMany({ where: { id: input.mediaId, attachmentId: input.attachmentId }, data: { ready: true } }),
  );
}

export async function updateMedia(tx: OrgTx, access: MemberAccess, input: UpdateAiMediaInput): Promise<void> {
  const row = await tx.aiMedia.findUnique({ where: { id: input.mediaId }, select: { id: true } });
  if (row === null) throw notFound();
  await tx.aiMedia.update({
    where: { id: row.id },
    data: { title: input.title, whenToSend: input.whenToSend, enabled: input.enabled },
  });
  await audit(tx, access, "ai.media-changed", row.id, input.title);
}

export async function deleteMedia(tx: OrgTx, access: MemberAccess, mediaId: string): Promise<void> {
  const row = await tx.aiMedia.findUnique({ where: { id: mediaId }, select: { id: true, title: true } });
  if (row === null) throw notFound();
  await tx.aiMedia.update({ where: { id: row.id }, data: softDeleted(access.userId) });
  await audit(tx, access, "ai.media-deleted", row.id, row.title);
}

/** A 5-minute link to look at one, for the settings screen. */
export async function mediaLink(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  mediaId: string,
): Promise<{ url: string }> {
  const row = await db.forOrg(access.organizationId, (tx) =>
    tx.aiMedia.findUnique({ where: { id: mediaId }, select: { id: true, attachmentId: true } }),
  );
  if (row === null) throw notFound();
  const link = await files.downloadLink(access, {
    recordType: AI_MEDIA_RECORD_TYPE,
    recordId: row.id,
    attachmentId: row.attachmentId,
  });
  return { url: link.url };
}

/** What the agent may send, numbered for the prompt ("M1"), with whether it went to this chat already. */
export interface PromptMedia {
  code: string;
  id: string;
  title: string;
  whenToSend: string;
  kind: string;
  sentHere: boolean;
}

export async function mediaForPrompt(tx: OrgTx, conversationId: string): Promise<PromptMedia[]> {
  const rows = await tx.aiMedia.findMany({
    where: { ready: true, enabled: true },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: { id: true, title: true, whenToSend: true, contentType: true },
  });
  const media = [];
  for (const [index, row] of rows.entries()) {
    const sent = await tx.whatsappMessage.findFirst({
      where: { conversationId, clientToken: { endsWith: tokenEnd(row.id) } },
      select: { id: true },
    });
    media.push({
      code: `M${String(index + 1)}`,
      id: row.id,
      title: row.title,
      whenToSend: row.whenToSend,
      kind: kindOf(row.contentType),
      sentHere: sent !== null,
    });
  }
  return media;
}

/**
 * Sends the media the agent chose with its reply, each as a message of its own after the words: at most three, never one
 * it already sent in this chat. Each piece's token comes from the turn's, so a turn run again sends nothing twice.
 */
export async function sendChosenMedia(
  { db, files }: { db: Database; files: Files },
  input: { organizationId: string; conversationId: string; chosen: readonly PromptMedia[]; token: string },
  now: Date,
): Promise<number> {
  const actor = systemActor(input.organizationId);
  let sent = 0;
  for (const media of input.chosen.filter((one) => !one.sentHere).slice(0, MAX_AI_MEDIA_PER_REPLY)) {
    const clientToken = `ai:${input.token}${tokenEnd(media.id)}`;
    const earlier = await db.forOrg(input.organizationId, (tx) =>
      tx.whatsappMessage.findFirst({ where: { clientToken }, select: { id: true } }),
    );
    if (earlier !== null) continue;
    const row = await db.forOrg(input.organizationId, (tx) =>
      tx.aiMedia.findUnique({
        where: { id: media.id },
        select: { attachmentId: true, fileName: true, contentType: true },
      }),
    );
    if (row === null) continue;
    const messageId = newUuidV7();
    await files.copyFile(
      actor,
      { recordType: AI_MEDIA_RECORD_TYPE, recordId: media.id, attachmentId: row.attachmentId },
      { recordType: WHATSAPP_RECORD_TYPE, recordId: messageId },
    );
    const result = await db.forOrg(input.organizationId, (tx) =>
      queueSystemText(
        tx,
        {
          conversationId: input.conversationId,
          body: "",
          sentBy: null,
          origin: "automation",
          clientToken,
          answers: true,
          media: { messageId, kind: kindOf(row.contentType), fileName: row.fileName },
        },
        now,
      ),
    );
    // The window closed or the number paused: the rest would be refused too.
    if (!result.ok) break;
    sent += 1;
  }
  return sent;
}
