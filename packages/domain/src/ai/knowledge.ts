// What the agency tells its AI to know: its packages, prices, inclusions and policies, typed or read from a PDF or a text
// file (uploaded straight to storage; the worker reads its words). Each piece can be turned off; deleting one deletes its
// file too. Written by whoever manages the AI (ai:manage); audited. The pieces go in a prompt as data, never as orders.
import { AI_KNOWLEDGE_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  aiDocumentAddedEvent,
  aiKnowledgeList,
  type AiKnowledgeItem,
  type RequestAiDocumentInput,
  type UpdateAiKnowledgeInput,
} from "@travel-crm/contracts/ai";
import { softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { defineListener, publishEvent, type EventListener } from "../jobs/index.js";
import { DomainError, newUuidV7 } from "../kernel/index.js";

/** Published when a document's file is stored: the worker reads its words. */
export const AI_DOCUMENT_ADDED_EVENT = "ai.document-added";

const columns = {
  id: true,
  title: true,
  body: true,
  kind: true,
  fileName: true,
  status: true,
  enabled: true,
  updatedAt: true,
} as const;
const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

export async function listKnowledge(tx: OrgTx): Promise<AiKnowledgeItem[]> {
  const rows = await tx.aiKnowledge.findMany({ orderBy: { createdAt: "desc" }, select: columns });
  return aiKnowledgeList.parse(rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })));
}

/** An audit entry names the piece by its id and its length, never its words. */
const audit = (
  tx: OrgTx,
  access: MemberAccess,
  action: "ai.knowledge-added" | "ai.knowledge-changed" | "ai.knowledge-deleted",
  id: string,
  length: number,
) =>
  recordAudit(tx, access, {
    action,
    entityType: "ai_knowledge",
    entityId: id,
    ...(action === "ai.knowledge-deleted" ? { before: { length } } : { after: { length } }),
  });

export async function addKnowledge(
  tx: OrgTx,
  access: MemberAccess,
  input: { title: string; body: string },
): Promise<void> {
  const row = await tx.aiKnowledge.create({
    data: { title: input.title, body: input.body, createdBy: access.userId },
    select: { id: true },
  });
  await audit(tx, access, "ai.knowledge-added", row.id, input.body.length);
}

export async function updateKnowledge(tx: OrgTx, access: MemberAccess, input: UpdateAiKnowledgeInput): Promise<void> {
  const row = await tx.aiKnowledge.findUnique({ where: { id: input.knowledgeId }, select: { id: true } });
  if (row === null) throw notFound();
  await tx.aiKnowledge.update({
    where: { id: row.id },
    data: { title: input.title, body: input.body, enabled: input.enabled },
  });
  await audit(tx, access, "ai.knowledge-changed", row.id, input.body.length);
}

/** Deletes a piece, and a document's file with it. */
export async function deleteKnowledge(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  knowledgeId: string,
): Promise<void> {
  const row = await db.forOrg(access.organizationId, (tx) =>
    tx.aiKnowledge.findUnique({ where: { id: knowledgeId }, select: { id: true, attachmentId: true, body: true } }),
  );
  if (row === null) throw notFound();
  // The file goes first: if storage fails the row is still there, and the person can try again.
  if (row.attachmentId !== null) {
    await files.remove(access, {
      recordType: AI_KNOWLEDGE_RECORD_TYPE,
      recordId: row.id,
      attachmentId: row.attachmentId,
    });
  }
  await db.forOrg(access.organizationId, async (tx) => {
    await tx.aiKnowledge.update({ where: { id: row.id }, data: softDeleted(access.userId) });
    await audit(tx, access, "ai.knowledge-deleted", row.id, row.body.length);
  });
}

/** Step one of a document: its row (reading) and where the browser puts the file. */
export async function requestDocument(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  input: RequestAiDocumentInput,
) {
  const knowledgeId = newUuidV7();
  const { attachment, upload } = await files.requestUpload(access, {
    recordType: AI_KNOWLEDGE_RECORD_TYPE,
    recordId: knowledgeId,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sensitive: false,
  });
  await db.forOrg(access.organizationId, async (tx) => {
    await tx.aiKnowledge.create({
      data: {
        id: knowledgeId,
        title: input.title,
        kind: "file",
        attachmentId: attachment.id,
        fileName: input.fileName,
        status: "reading",
        createdBy: access.userId,
      },
    });
    await audit(tx, access, "ai.knowledge-added", knowledgeId, 0);
  });
  return { knowledgeId, attachmentId: attachment.id, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
}

/** Step two: the file is stored; the worker reads its words. */
export async function confirmDocument(
  { db, files }: { db: Database; files: Files },
  access: MemberAccess,
  input: { knowledgeId: string; attachmentId: string },
): Promise<void> {
  await files.confirmUpload(access, {
    recordType: AI_KNOWLEDGE_RECORD_TYPE,
    recordId: input.knowledgeId,
    attachmentId: input.attachmentId,
  });
  await db.forOrg(access.organizationId, (tx) =>
    publishEvent(tx, { type: AI_DOCUMENT_ADDED_EVENT, payload: { knowledgeId: input.knowledgeId } }),
  );
}

/** A document was uploaded: its words become what the AI knows, or it is marked failed. */
export function aiDocumentListener(dependencies: {
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

/** Characters of the agency's knowledge a prompt carries at most. */
const KNOWLEDGE_BUDGET = 8_000;

/** The agency's enabled, ready knowledge as one block of data for a prompt, within a budget; empty for none. */
export async function knowledgeWords(tx: OrgTx): Promise<{ title: string; body: string }[]> {
  const rows = await tx.aiKnowledge.findMany({
    where: { enabled: true, status: "ready" },
    orderBy: { updatedAt: "desc" },
    select: { title: true, body: true },
  });
  let left = KNOWLEDGE_BUDGET;
  const chosen: { title: string; body: string }[] = [];
  for (const row of rows) {
    if (row.body.trim() === "" || left <= 0) continue;
    const body = row.body.trim().slice(0, left);
    chosen.push({ title: row.title, body });
    left -= body.length;
  }
  return chosen;
}
