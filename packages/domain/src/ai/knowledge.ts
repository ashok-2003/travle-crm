// What the AI agent knows (the AI sales agent): the agency's packages, prices, inclusions and policies, typed in or read
// from a document (a PDF or plain text, uploaded straight to storage; the worker reads its words). Each piece can be
// turned off; deleting one soft-deletes it. Written by whoever manages settings; audited.
import { AI_KNOWLEDGE_RECORD_TYPE } from "@travel-crm/contracts/files";
import {
  aiKnowledgeList,
  type AiKnowledgeItem,
  type RequestAiDocumentInput,
  type UpdateAiKnowledgeInput,
} from "@travel-crm/contracts/ai";
import { softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
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

const audit = (
  tx: OrgTx,
  access: MemberAccess,
  action: "ai.knowledge-added" | "ai.knowledge-changed" | "ai.knowledge-deleted",
  id: string,
  title: string,
) =>
  recordAudit(tx, access, {
    action,
    entityType: "ai_knowledge",
    entityId: id,
    ...(action === "ai.knowledge-deleted" ? { before: { title } } : { after: { title } }),
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
  await audit(tx, access, "ai.knowledge-added", row.id, input.title);
}

export async function updateKnowledge(tx: OrgTx, access: MemberAccess, input: UpdateAiKnowledgeInput): Promise<void> {
  const row = await tx.aiKnowledge.findUnique({ where: { id: input.knowledgeId }, select: { id: true, kind: true } });
  if (row === null) throw notFound();
  await tx.aiKnowledge.update({
    where: { id: row.id },
    data: { title: input.title, body: input.body, enabled: input.enabled },
  });
  await audit(tx, access, "ai.knowledge-changed", row.id, input.title);
}

export async function deleteKnowledge(tx: OrgTx, access: MemberAccess, knowledgeId: string): Promise<void> {
  const row = await tx.aiKnowledge.findUnique({ where: { id: knowledgeId }, select: { id: true, title: true } });
  if (row === null) throw notFound();
  await tx.aiKnowledge.update({ where: { id: row.id }, data: softDeleted(access.userId) });
  await audit(tx, access, "ai.knowledge-deleted", row.id, row.title);
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
    await audit(tx, access, "ai.knowledge-added", knowledgeId, input.title);
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
